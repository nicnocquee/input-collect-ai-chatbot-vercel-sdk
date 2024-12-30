"use server";

import { generateText, tool, nanoid } from "ai";
import { z } from "zod";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Airtable API constants
const AIRTABLE_API_KEY = "patuiAgEvFzitXyIu.a0fed140f02983ccc3dfeed6c02913b5e2593253cb784a08c3cfd8ac96518ba0";
const AIRTABLE_BASE_ID = "appFf0nHuVTVWRjTa";
const AIRTABLE_ACCOUNTS_TABLE = "Accounts";

export async function continueConversation(history: Message[], record: any = null) {
  try {
    console.log("[LLM] continueConversation - History:", JSON.stringify(history, null, 2));
    console.log("[LLM] Record for context:", JSON.stringify(record, null, 2));

    const initialMessage = record
      ? { role: "assistant", content: `Here's your account: ${JSON.stringify(record)}` }
      : null;

    const result = await generateText({
      model: {
        type: "openai-chat", // Correct type for OpenAI Chat models
        name: "gpt-4-turbo",
      },
      system: `You are a Wonderland assistant! 
        Reply with nicely formatted markdown. 
        Keep your replies short and concise. 
        If this is the first reply send a nice welcome message.
        If the selected Account is different mention account or company name once.

        Perform the following actions:
        - Create a new account in Wonderland when the user requests it.
        - Modify an existing account in Wonderland when the user requests it.

        When creating or modifying an account:
        - Extract the required information (e.g., account name, description, or specific fields to update) from the user's input.
        - Ensure all extracted values are sent outside the user message in a structured format.
        - Confirm the action with the user before finalizing.
        
        Log all actions and results.`,
      messages: initialMessage ? [initialMessage, ...history] : history,
      tools: {
        createAccount,
        modifyAccount,
      },
    });

    console.log("[LLM] Result from generateText:", JSON.stringify(result, null, 2));

    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: result.text || "I'm sorry, something went wrong. Please try again.",
        },
      ],
    };
  } catch (error) {
    console.error("[LLM] Error in continueConversation:", error);
    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: `An error occurred while processing your request. Error details: ${error.message}`,
        },
      ],
    };
  }
}

const createAccount = tool({
  description: "Create a new account in Wonderland.",
  parameters: z.object({
    name: z.string().min(1).describe("The name of the account holder."),
    description: z.string().min(1).describe("A description for the account."),
  }),
  execute: async ({ name, description }) => {
    console.log("[TOOL] createAccount - Parameters:", { name, description });

    try {
      const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_ACCOUNTS_TABLE}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            Name: name,
            Description: description,
            AccountNumber: nanoid(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create account. HTTP Status: ${response.status}`);
      }

      const data = await response.json();
      console.log("[TOOL] createAccount - Success:", JSON.stringify(data, null, 2));

      return {
        message: `Successfully created a new account for ${name} with the description: ${description}.`,
      };
    } catch (error) {
      console.error("[TOOL] createAccount - Error:", error);
      return { message: `Failed to create account: ${error.message}` };
    }
  },
});

const modifyAccount = tool({
  description: "Modify an existing account in Wonderland.",
  parameters: z.object({
    recordId: z.string().min(1).describe("The Airtable Record ID for the account."),
    fieldToUpdate: z.string().min(1).describe("The field to update (e.g., Name, Description)."),
    newValue: z.string().min(1).describe("The new value to assign to the specified field."),
  }),
  execute: async ({ recordId, fieldToUpdate, newValue }) => {
    console.log("[TOOL] modifyAccount - Parameters:", { recordId, fieldToUpdate, newValue });

    try {
      const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_ACCOUNTS_TABLE}/${recordId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            [fieldToUpdate]: newValue,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to modify account. HTTP Status: ${response.status}`);
      }

      const data = await response.json();
      console.log("[TOOL] modifyAccount - Success:", JSON.stringify(data, null, 2));

      return {
        message: `Successfully updated the ${fieldToUpdate} to "${newValue}" for the account.`,
      };
    } catch (error) {
      console.error("[TOOL] modifyAccount - Error:", error);
      return { message: `Failed to modify account: ${error.message}` };
    }
  },
});
