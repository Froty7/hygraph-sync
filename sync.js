import { ApolloClient, InMemoryCache } from "@apollo/client/core/core.cjs";
import dotenv from "dotenv";

// import fetch from "node-fetch";
import main from "./src/index.js";
// Load environment variables from .env file
dotenv.config();

// Initialize Apollo Client
const client = new ApolloClient({
  uri: process.env.GRAPHQL_API_URL, // Use the API URL from environment variables
  cache: new InMemoryCache(),
  fetch,
  headers: {
    Authorization: `Bearer ${process.env.AUTH_TOKEN}`, // Use the auth token from environment variables
  },
});

// Execute the function
main({ args: process.argv.slice(2), client });
