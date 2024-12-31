"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import Airtable from "airtable";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Initialize Airtable base
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID || "missing_base_id");

export async function continueConversation(history: Message[]) {
  "use server";

  const logs: string[] = [];
  try {
    logs.push("[LLM] continueConversation: Starting...");
    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a Wonderland assistant!
        Reply with nicely formatted markdown. 
        Keep your replies short and concise. 
        If this is the first reply send a nice welcome message.
        If the selected Account is different mention account or company name once.

        Perform the following actions:
        - Create a new account in Wonderland when the user requests it.
        - Modify an existing account in Wonderland when the user requests it.
        - Delete an existing account in Wonderland when the user requests it.

        When creating or modifying an account:
        - Extract the required information (e.g., account name, description, or specific fields to update) from the user's input.
        - Ensure all extracted values are sent outside the user message in a structured format.
        - Confirm the action with the user before finalizing.`,
      messages: history,
      maxToolRoundtrips: 5,
      tools: {
        createAccount,
        modifyAccount,
        deleteAccount,
      },
    });

    logs.push("[LLM] Conversation processed successfully.");

    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content:
            text ||
            toolResults.map((toolResult) => toolResult.result).join("\n"),
        },
      ],
      logs,
    };
  } catch (error) {
    logs.push("[LLM] Error in continueConversation: " + (error instanceof Error ? error.message : JSON.stringify(error)));
    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: `There's a problem executing the request. Please try again. Error details: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
      logs,
    };
  }
}

const createAccount = tool({
  description: "Create a new account in Wonderland with comprehensive details.",
  parameters: z.object({
    Name: z.string().optional(),
    Description: z.string().optional(),
    "Client Company Name": z.string().optional(),
    "Client URL": z.string().optional(),
    Status: z.string().optional(),
    Industry: z.string().optional(),
    "Primary Contact Person": z.string().optional(),
    "About the Client": z.string().optional(),
    "Primary Objective": z.string().optional(),
    "Talking Points": z.string().optional(),
    "Contact Information": z.string().optional(),
    "Priority Image": z.string().optional(),
    Instagram: z.string().optional(),
    Facebook: z.string().optional(),
    Blog: z.string().optional(),
    "Other Social Accounts": z.string().optional(),
  }),
  execute: async (fields) => {
    const logs: string[] = [];
    try {
      logs.push("[TOOL] Starting account creation process...");
      logs.push("[TOOL] Initial fields received: " + JSON.stringify(fields, null, 2));

      // Ensure Name and Client Company Name consistency
      if (!fields.Name && fields["Client Company Name"]) {
        fields.Name = fields["Client Company Name"];
      } else if (!fields["Client Company Name"] && fields.Name) {
        fields["Client Company Name"] = fields.Name;
      }

      // Title case the Name field
      if (fields.Name) {
        fields.Name = fields.Name.replace(/\b\w/g, (char) => char.toUpperCase());
      }

      // Fetch available industry options from Airtable
      const allowedIndustries = await airtableBase("Accounts").select({ fields: ["Industry"] }).all();
      const industryOptions = allowedIndustries
        .map((record) => record.get("Industry"))
        .filter((value): value is string => typeof value === "string");

      // Guess Industry based on client information
      const guessIndustry = (info: string) => {
        const lowerInfo = info.toLowerCase();
        const matchedIndustry = industryOptions.find((industry) =>
          lowerInfo.includes(industry.toLowerCase())
        );
        return matchedIndustry || "General";
      };
      fields.Industry = fields.Industry || guessIndustry(fields.Description || fields["About the Client"] || "");

      // Rewrite "About the Client"
      fields["About the Client"] =
        fields["About the Client"] ||
        `The client specializes in ${fields.Description?.toLowerCase()}. Utilizing Wonderland, the account will automate content creation and strategically distribute it across platforms to align with client goals and target audience needs.`;

      // Generate Primary Objective and Talking Points
      const generatePrimaryObjective = (info: string) => {
        return `To enhance the reach and engagement of ${info.toLowerCase()}, ensuring alignment with client goals through targeted marketing and AI-driven automation.`;
      };
      const generateTalkingPoints = (info: string) => {
        return [
          `Showcase expertise in ${info.toLowerCase()}.`,
          "Highlight innovative solutions for target audiences.",
          "Focus on building trust and brand identity.",
        ].join("\n");
      };
      fields["Primary Objective"] =
        fields["Primary Objective"] || generatePrimaryObjective(fields.Description || fields.Name || "the client");
      fields["Talking Points"] =
        fields["Talking Points"] || generateTalkingPoints(fields.Description || fields.Name || "the client");

      // Ensure minimum 600-character recommendations for descriptions
      fields.Description =
        fields.Description ||
        `This account is focused on ${fields.Name?.toLowerCase() || "the client"}, ensuring tailored solutions for the ${fields.Industry || "General"} sector. Utilizing Wonderland, it maximizes visibility and engagement for strategic growth.`;
      fields.Description = fields.Description.padEnd(600, ".");

      // Create the account in Airtable
      logs.push("[TOOL] Creating account in Airtable...");
      const createdRecord = await airtableBase("Accounts").create(fields);

      if (!createdRecord || !createdRecord.id) {
        throw new Error("Failed to create the account in Airtable.");
      }

      logs.push("[TOOL] Account created successfully with Record ID: " + createdRecord.id);

      return {
        message: `Account "${fields.Name}" created successfully with Record ID: ${createdRecord.id}`,
        recordId: createdRecord.id,
        logs,
      };
    } catch (error) {
      logs.push("[TOOL] Error during account creation: " + (error instanceof Error ? error.message : JSON.stringify(error)));
      throw {
        message: "Account creation failed. Check logs for details.",
        logs,
      };
    }
  },
});

// Exports for other tools (modifyAccount and deleteAccount) remain unchanged.


const modifyAccount = tool({
  description: "Modify any field of an existing account in Wonderland.",
  parameters: z.object({
    recordId: z.string().describe("The record ID of the account to modify."),
    fields: z.object({
      Name: z.string().optional(),
      Description: z.string().optional(),
      "Client Company Name": z.string().optional(),
      "Client URL": z.string().optional(),
      Status: z.string().optional(),
      Industry: z.string().optional(),
      "Primary Contact Person": z.string().optional(),
      "About the Client": z.string().optional(),
      "Primary Objective": z.string().optional(),
      "Talking Points": z.string().optional(),
      "Contact Information": z.string().optional(),
    })
      .partial()
      .refine((obj) => Object.keys(obj).length > 0, {
        message: "At least one field must be provided to update.",
      }),
  }),
  execute: async ({ recordId, fields }) => {
    console.log("[TOOL] modifyAccount", { recordId, fields });

    try {
      if (!recordId) {
        throw new Error("recordId is required to identify the account.");
      }

      console.log("[TOOL] Searching by record ID...");
      const accountRecord = await airtableBase("Accounts").find(recordId);

      if (!accountRecord) {
        throw new Error(`No account found with the record ID: ${recordId}`);
      }

      console.log("[TOOL] Account found:", accountRecord);

      // Match Status and Industry to closest allowed values dynamically
      const allowedStatuses = ["Active", "Disabled", "New"];
      if (fields.Status) {
        fields.Status = allowedStatuses.reduce((closest, current) =>
          fields.Status!.toLowerCase().includes(current.toLowerCase()) ? current : closest,
          allowedStatuses[0]
        );
      }

      const allowedIndustries = await airtableBase("Accounts").select({ fields: ["Industry"] }).all();
      const industryOptions = allowedIndustries
        .map((record) => record.get("Industry"))
        .filter((value): value is string => typeof value === "string");
      if (fields.Industry && industryOptions.length > 0) {
        fields.Industry = industryOptions.reduce((closest, current) =>
          fields.Industry!.toLowerCase().includes(current.toLowerCase()) ? current : closest,
          industryOptions[0]
        );
      }

      console.log("[TOOL] Updating account with fields:", fields);

      const updatedRecord = await airtableBase("Accounts").update(accountRecord.id, fields);

      console.log("[TOOL] Account updated successfully:", updatedRecord);

      return {
        message: `Account successfully updated. Updated fields: ${JSON.stringify(fields)}.`,
        recordId: updatedRecord.id,
      };
    } catch (error) {
      console.error("[TOOL] Error modifying account in Airtable:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });

      throw new Error(
        JSON.stringify({
          error: "Failed to modify account.",
          details: error instanceof Error ? { message: error.message, stack: error.stack } : { raw: error },
        })
      );
    }
  },
});

const deleteAccount = tool({
  description: "Delete an existing account in Wonderland by changing its status to 'Deleted'.",
  parameters: z.object({
    recordId: z.string().describe("The record ID of the account to delete."),
  }),
  execute: async ({ recordId }) => {
    console.log("[TOOL] deleteAccount", { recordId });

    try {
      if (!recordId) {
        throw new Error("recordId is required to identify the account.");
      }

      console.log("[TOOL] Searching by record ID...");
      const accountRecord = await airtableBase("Accounts").find(recordId);

      if (!accountRecord) {
        throw new Error(`No account found with the record ID: ${recordId}`);
      }

      console.log("[TOOL] Account found:", accountRecord);

      console.log("[TOOL] Changing account status to 'Deleted'...");
      const updatedRecord = await airtableBase("Accounts").update(accountRecord.id, { Status: "Deleted" });

      console.log("[TOOL] Account status updated successfully:", updatedRecord);

      return {
        message: `Account with record ID ${recordId} has been successfully marked as 'Deleted'.`,
        recordId: updatedRecord.id,
      };
    } catch (error) {
      console.error("[TOOL] Error deleting account in Airtable:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });

      throw new Error(
        JSON.stringify({
          error: "Failed to delete account.",
          details: error instanceof Error ? { message: error.message, stack: error.stack } : { raw: error },
        })
      );
    }
  },
});
