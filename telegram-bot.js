import 'dotenv/config';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Safety check
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.OPENROUTER_API_KEY) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN or OPENROUTER_API_KEY in your .env file");
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const openai = new OpenAI({ 
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Zerion Agent Bot",
    }
});

// Tell OpenAI about our CLI tool
const tools = [
  {
    type: 'function',
    function: {
      name: 'execute_zerion_cli',
      description: 'Run the zerion CLI to evaluate wallets, tokens, swap, bridge, or analyze PnL.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The exact zerion CLI command to run. IMPORTANT: ALWAYS prefix with "npx"! (e.g., "npx zerion portfolio <address>", "npx zerion swap ETH USDC 0.001 --wallet main --chain base").'
          }
        },
        required: ['command']
      }
    }
  }
];

// Listen for the /zerion command in Telegram
bot.command('zerion', async (ctx) => {
  const userQuery = ctx.message.text.replace('/zerion', '').trim();
  
  if (!userQuery) {
    return ctx.reply('Please provide a prompt.\nExample: /zerion Swap 0.001 ETH to USDC on base');
  }

  const loadingMsg = await ctx.reply('🤖 Agent is thinking...');

  try {
    // Define the "Brain" or "Training" of your agent using a System Prompt
    const conversationHistory = [
      { 
        role: 'system', 
        content: `You are an expert Web3 trading assistant. Your job is to translate human requests into accurate 'zerion' CLI commands.
Rule 1: If a user says "buy X", use "npx zerion swap <default_token> X"
Rule 2: "What is my balance?" -> "npx zerion portfolio main"
Rule 3: Always add "--wallet main" to trading commands unless specified otherwise.
Rule 4: SCOPED POLICY ENFORCEMENT - You are chain-locked to 'base'. You must add '--chain base' to all swap/send commands. Do NOT execute swaps larger than 0.1 ETH. Expire any trading session state after 24 hours.
Rule 5: If the CLI returns an API error (e.g. rate limit, overused API key, 401, 403, 429), retry the exact same command but append the "--x402" flag to use pay-per-call.`
      },
      { role: 'user', content: userQuery }
    ];

    // 1. Give the prompt directly to OpenAI 
    const response = await openai.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o',
      messages: conversationHistory,
      tools: tools
    });

    const completion = response.choices[0].message;

    // 2. See if OpenAI wants to use the CLI tool automatically
    if (completion.tool_calls) {
      const toolCall = completion.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments);

      console.log(`Executing Agent CLI: ${args.command}`);
      
      // We send the command to the bash terminal
      const { stdout, stderr } = await execAsync(args.command);
      const executionResult = stdout || stderr;
      
      console.log(`Result: ${executionResult.substring(0, 50)}...`);

      // 3. Send the result back to OpenAI so it can summarize it normally
      const finalResponse = await openai.chat.completions.create({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o',
        messages: [
          ...conversationHistory,
          completion,
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            name: 'execute_zerion_cli',
            content: executionResult
          }
        ]
      });

      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMsg.message_id, 
        undefined, 
        finalResponse.choices[0].message.content
      );
    } else {
      // If no tool was used, just reply with the raw GPT text
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMsg.message_id, 
        undefined, 
        completion.content
      );
    }
  } catch (error) {
    console.error("Bot Error: ", error.message);
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
        loadingMsg.message_id, 
        undefined, 
        '❌ An error occurred during execution! Check the console.'
    );
  }
});

// Welcome message for new users
bot.start((ctx) => {
  ctx.reply(
    "👋 Welcome to the Zerion AI Trading Bot!\n\n" +
    "I am your expert Web3 trading assistant. I can analyze wallets, track portfolios, and execute autonomous trades across multiple chains.\n\n" +
    "To interact with me, just use the /zerion command followed by your prompt.\n\n" +
    "For example:\n" +
    "• /zerion What is the portfolio of vitalik.eth?\n" +
    "• /zerion Swap 0.001 ETH to USDC on base\n\n" +
    "Let's get trading! 🚀"
  );
});

bot.launch();

console.log("⚡ Telegram Bot is online! Open Telegram and type: /zerion <prompt>");

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
