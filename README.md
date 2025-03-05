# Asset Sync Tool

This tool helps you synchronize assets from Hygraph using commands similar to `rsync`. It allows you to push, pull, and publish assets efficiently.

## Features

- **Push Assets**: `npm run push` - Uploads new assets and updates their metadata.
- **Pull Assets**: `npm run pull [limit]` - Pulls assets from the source, with an optional limit on the number of assets.
- **Publish Assets**: `npm run publish` - Publishes the assets.

## Asset Structure

The assets are stored in the `Assets` folder, which contains the following important subfolders:

- **ignore**: Any files in this folder are ignored during the push and publish operations.
- **ReUpload**: Any files in this folder will be uploaded as new assets and their metadata will be updated during the push.
- **metadata**: Any files in this folder will have their metadata updated during the push.

Additionally, there is a file called `assets.json` . This file includes all asset metadata.

## Installation

To install the tool, clone this repository and run:

```bash
npm install
```
