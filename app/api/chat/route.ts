import { continueConversation } from "../../actions";

export async function POST(req: Request) {
  console.log("[POST /api/chat] Request received");

  try {
    const body = await req.json();
    console.log("[POST /api/chat] Parsed body:", JSON.stringify(body, null, 2));

    const { messages, record } = body;

    if (!messages || !Array.isArray(messages)) {
      console.error("[POST /api/chat] Invalid input: messages is not an array.");
      return new Response(JSON.stringify({ error: "Invalid input format." }), {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (!record || !record.type) {
      console.error("[POST /api/chat] No valid record provided.");
      return new Response(
        JSON.stringify({ error: "Record with valid type is required." }),
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    console.log("[POST /api/chat] Processing record and messages:", {
      record,
      messages,
    });

    const result = await continueConversation([
      { role: "assistant", content: `Processing record: ${JSON.stringify(record)}` },
      ...messages,
    ]);

    console.log("[POST /api/chat] Logs:", JSON.stringify(result.logs || [], null, 2));

    return new Response(
      JSON.stringify({
        ...result,
        logs: result.logs || [],
      }),
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[POST /api/chat] Error:", error);

    return new Response(
      JSON.stringify({
        error: "An error occurred.",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        raw: error,
      }),
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
