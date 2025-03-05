import { gql } from "@apollo/client/core/core.cjs";
import { createWriteStream, existsSync, openAsBlob } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import p from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { walk } from "walk";

const PUBLISH_ASSETS = gql`
  mutation Publish($id: ID = "") {
    publishAsset(where: { id: $id }) {
      fileName
    }
  }
`;

const PULL_ASSETS = gql`
  query Pull($first: Int = 10, $skip: Int = 0) {
    assets(first: $first, skip: $skip) {
      fileName
      id
      url
      altText
      position
      mimeType
    }
  }
`;

const UPDATE_ASSETS = gql`
  mutation Update($id: ID = "", $altText: String = "", $position: String = "") {
    updateAsset(
      where: { id: $id }
      data: { altText: $altText, position: $position }
    ) {
      fileName
    }
  }
`;

const UPDATE_ASSETS_WITH_REUPLOAD = gql`
  mutation Update($id: ID = "", $altText: String = "", $position: String = "") {
    updateAsset(
      data: { reUpload: true, altText: $altText, position: $position }
      where: { id: $id }
    ) {
      fileName
      upload {
        status
        error {
          code
          message
        }
        requestPostData {
          url
          date
          key
          signature
          algorithm
          policy
          credential
          securityToken
        }
      }
    }
  }
`;

const path = {
  assets: "Assets",
  ignore: p.join("Assets", "ignore"),
  metadata: p.join("Assets", "metadata"),
  reUpload: p.join("Assets", "reUpload"),
  json: p.join("Assets", "assets.json"),
};

const dirTemp = [];

const Main = async ({ args, client }) => {
  for (const dir of [path.assets, path.ignore, path.metadata, path.reUpload])
    if (!existsSync(dir)) await mkdir(dir);

  await modes[args[0]]({ client, args });
};

const searchAssets = (fileName) =>
  new Promise((end) => {
    if (!dirTemp.length) {
      const walker = walk(path.assets);
      walker.on("names", (root, names) => dirTemp.push(names));
      walker.on("end", end);
    } else end();
  }).then((r) => {
    for (const names of dirTemp) if (names.includes(fileName)) return true;
    return false;
  });

const downloadAsset = async (url, name) => {
  if (await searchAssets(name)) return;
  await new Promise((r) => setTimeout(r, process.env.PULL_TIME_SPAN ?? 100));
  return finished(
    Readable.fromWeb((await fetch(url)).body).pipe(
      createWriteStream(p.join(path.metadata, name), {
        flags: "wx",
      })
    )
  );
};

const modes = {
  test: async () => {
    console.log("test");
  },

  push: async ({ client }) => {
    if (!existsSync(path.json)) return console.error("please, pull first");

    const json = JSON.parse((await readFile(path.json)).toString());
    let done = 0;

    const walker = walk(path.assets);
    walker.on("errors", (root, nodeStatsArray, next) => {
      console.log(nodeStatsArray);
      next();
    });

    // walker.on("end", () => {
    //   console.log("all done");
    //   // server.close();
    // });

    walker.on("file", (root, fileStats, next) => {
      const shouldIgnore = root.startsWith(path.ignore);
      if (shouldIgnore) return next();
      const shouldReUpload = root.startsWith(path.reUpload);
      const shouldUpdate = root.startsWith(path.metadata);
      const { id, fileName, altText, position } =
        json.find((f) => f.id == fileStats.name.split(" ").at(1)) ?? {};
      if (!id) return next();

      let response;
      if (shouldReUpload) {
        response = client.mutate({
          mutation: UPDATE_ASSETS_WITH_REUPLOAD,
          variables: {
            id,
            altText,
            position,
          },
        });
        response.then(
          async ({
            data: {
              updateAsset: {
                upload: {
                  requestPostData: {
                    url,
                    date,
                    key,
                    signature,
                    algorithm,
                    policy,
                    credential,
                    securityToken,
                  },
                },
              },
            },
          }) => {
            const formData = new FormData();
            formData.append("X-Amz-Date", date);
            formData.append("key", key);
            formData.append("X-Amz-Signature", signature);
            formData.append("X-Amz-Algorithm", algorithm);
            formData.append("policy", policy);
            formData.append("X-Amz-Credential", credential);
            formData.append("X-Amz-Security-Token", securityToken);
            formData.append(
              "file",
              await openAsBlob(`${root}/${fileStats.name}`),
              fileName
            );
            fetch(url, {
              method: "POST",
              body: formData,
            })
              .then((r) => r.text())
              .then((t) => console.log(t || ` ➜ ➜ ${fileName}`));
          }
        );
      }
      if (shouldUpdate)
        response = client.mutate({
          mutation: UPDATE_ASSETS,
          variables: {
            id,
            altText,
            position,
          },
        });

      if (response)
        response.then(({ data }) => {
          !shouldReUpload &&
            console.info(
              `[ ${Math.round((100 * ++done) / json.length)}%] [${done} of ${
                json.length
              }] ➜ ${fileName}`
            );
          setTimeout(next, process.env.PUSH_TIME_SPAN ?? 100);
        });
      else setTimeout(next, process.env.PUSH_TIME_SPAN ?? 100);
    });
  },

  pull: async ({ client, args }) => {
    let limit;
    if (!args[1]) limit = process.env.DEFAULT_PULL_LIMIT ?? 100;
    else if (isNaN((limit = parseInt(args[1]))))
      return console.error("please, enter a valid number as limit");

    let jsonData = [];
    let done = 0;
    for (let skip = 0; skip < limit; skip += 100) {
      const { data } = await client.query({
        query: PULL_ASSETS,
        variables: {
          first: limit,
          skip,
        },
      });
      if (data.assets) {
        jsonData = jsonData.concat(data.assets);
        for (const { fileName, id, url } of data.assets) {
          const name = fileName.replace(/\s/g, "_");
          await downloadAsset(url, `${name} ${id} ${name}`);
          console.info(
            `[ ${Math.round(
              (100 * ++done) / limit
            )}%] [${done} of ${limit}] ➜ ${name}`
          );
        }
      }
    }
    if (existsSync(path.json)) {
      const json = JSON.parse((await readFile(path.json)).toString());
      jsonData = jsonData
        .filter((a) => !json.find((b) => a.id === b.id))
        .concat(json);
    }
    writeFile(path.json, JSON.stringify(jsonData, null, 2));
  },

  publish: async ({ client }) => {
    if (!existsSync(path.json)) return console.error("please, pull first");
    const json = JSON.parse((await readFile(path.json)).toString());
    let done = 0;
    const walker = walk(path.assets);
    walker.on("errors", (root, nodeStatsArray, next) => {
      console.error(nodeStatsArray);
      next();
    });
    walker.on("file", (root, fileStats, next) => {
      const shouldIgnore = root.startsWith(path.ignore);
      if (shouldIgnore) return next();
      const { id } =
        json.find((f) => f.id == fileStats.name.split(" ").at(1)) ?? {};
      if (!id) return next();
      client
        .mutate({
          mutation: PUBLISH_ASSETS,
          variables: {
            id,
          },
        })
        .then(({ data }) => {
          setTimeout(next, process.env.PUBLISH_TIME_SPAN ?? 1000);
          if (data.publishAsset)
            console.info(
              `[ ${Math.round((100 * ++done) / json.length)}%] [${done} of ${
                json.length
              }] ➜ ${data.publishAsset.fileName}`
            );
          else console.error(data);
        });
    });
  },
};

export default Main;
