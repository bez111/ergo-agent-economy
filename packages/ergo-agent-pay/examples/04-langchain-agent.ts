/**
 * Example 04 — LangChain Agent with Payment Tool
 *
 * An LLM agent that can send ERG payments autonomously.
 * The agent decides when and how much to pay based on the task.
 *
 * Prerequisites:
 *   npm install langchain @langchain/openai
 *   OPENAI_API_KEY=sk-...
 *
 * Run: npx tsx examples/04-langchain-agent.ts
 */

import { ErgoAgentPay } from "../src/index.js";

// ── 1. Create the payment agent ───────────────────────────────────────────────

const payAgent = new ErgoAgentPay({
  address: "YOUR_TESTNET_ADDRESS",
  network: "testnet",
  policy: {
    maxSinglePayment: 5_000_000n,     // 0.005 ERG max per payment
    maxSessionSpend: 50_000_000n,     // 0.05 ERG max per session
    afterPay: async (ctx, result) => {
      console.log(`[ergo] Paid ${ctx.value} nanoERG → ${result.txId ?? "(unsigned)"}`);
    },
  },
});

// ── 2. Get the LangChain tool ─────────────────────────────────────────────────

const ergoPayTool = payAgent.asLangChainTool({
  name: "ergo_pay",
  description: `Send ERG payments on the Ergo blockchain.
Use this tool when you need to pay for services, APIs, or data.
Input: JSON string with { to: string, amount: string, memo?: string }
Example: {"to": "3Wh...", "amount": "0.001 ERG", "memo": "payment for API call"}`,
});

// ── 3. Wire into your LangChain agent ─────────────────────────────────────────

// This is the pattern — adapt to your LangChain setup:
//
// import { ChatOpenAI } from "@langchain/openai"
// import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents"
// import { ChatPromptTemplate } from "@langchain/core/prompts"
//
// const llm = new ChatOpenAI({ modelName: "gpt-4", temperature: 0 })
//
// const prompt = ChatPromptTemplate.fromMessages([
//   ["system", "You are an autonomous agent. You can send ERG payments for services."],
//   ["human", "{input}"],
//   ["placeholder", "{agent_scratchpad}"],
// ])
//
// const agent = await createOpenAIFunctionsAgent({ llm, tools: [ergoPayTool], prompt })
// const executor = new AgentExecutor({ agent, tools: [ergoPayTool], verbose: true })
//
// const result = await executor.invoke({
//   input: "Pay 0.001 ERG to 3Wh... for the weather data API call"
// })
// console.log(result.output)

// ── 4. Or use the OpenAI function calling adapter directly ────────────────────

const { definition, handler } = payAgent.asOpenAIFunction({ name: "ergo_pay" });

console.log("OpenAI function definition:");
console.log(JSON.stringify(definition, null, 2));

// When OpenAI responds with a function_call:
// const functionArgs = JSON.parse(response.choices[0].message.function_call.arguments)
// const result = await handler(functionArgs)
// console.log(result) → { success: true, txId: "...", submitted: true }

// ── 5. Standalone tool test ───────────────────────────────────────────────────

console.log("\nTesting LangChain tool directly:");
const toolResult = await ergoPayTool.func(
  JSON.stringify({
    to: "3WwbzW6u8hKWBcL1W7kNVMr25s2UHfSBnYtwSHvrRQt7DdPuoXrt",
    amount: "0.001 ERG",
    memo: "test from langchain tool",
  })
);
console.log("Tool result:", toolResult);
