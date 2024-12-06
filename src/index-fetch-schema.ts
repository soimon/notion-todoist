require("module-alias/register");
import { log } from "@lib/utils/dev";
import { Client } from "@notionhq/client";
import { config as configDotEnv } from "dotenv";
configDotEnv();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function fetchProjectSchema() {
  try {
    const response = await notion.databases.retrieve({
      database_id: process.env.NOTION_DB_PROJECTS,
    });
    await log("schema", response);

    const properties = response.properties;
    const propertiesObject = Object.fromEntries(
      Object.entries(properties).map(([name, property]) => [name, property.id]),
    );
    console.log(propertiesObject);
  } catch (error) {
    console.error("Error fetching project schema:", error);
  }
}

fetchProjectSchema();
