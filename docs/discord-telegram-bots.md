# Attaching Zerion AI to Discord and Telegram

The `zerion-ai` repository provides the **skills** and underlying AI integrations (via MCP or CLI capabilities) that let an AI agent evaluate crypto wallets and execute trades. It does not provide native listener bots for platforms like Discord or Telegram.

To bring your AI agent to a chat platform, you need a "bot wrapper." This wrapper listens for chat messages, forwards them to an AI framework equipped with Zerion skills, and returns the response to the user.

---

## 1. Discord Bot Implementation (Node.js)

For Discord, use `discord.js` along with the OpenAI SDK. The agent invokes the `zerion` CLI under the hood.

### Prerequisites
Installs:
```bash
npm install discord.js openai
```

### Boilerplate `discord-bot.js`

```javascript
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import OpenAI from 'openai';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Setup Discord Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel],
});

// The CLI tool configuration for the LLM
const tools = [
  {
    type: 'function',
    function: {
      name: 'execute_zerion_cli',
      description: 'Execute the zerion CLI for wallet evaluation or token swaps.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The exact zerion CLI command to run (e.g. "zerion wallet analyze <address>", "zerion swap ETH USDC 0.01")',
          },
        },
        required: ['command'],
      },
    },
  },
];

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!zerion')) return;

  const userQuery = message.content.replace('!zerion', '').trim();
  const loadingMsg = await message.reply('Thinking...');

  try {
    // 1. Ask OpenAI to form a plan
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: userQuery }],
      tools: tools,
    });

    const completion = response.choices[0].message;

    // 2. Check if OpenAI wants to use the CLI tool
    if (completion.tool_calls) {
      const toolCall = completion.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments);

      // Execute the requested Zerion command
      const { stdout, stderr } = await execAsync(args.command);
      
      // 3. Send results back to the LLM to format for the user
      const finalResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: userQuery },
          completion,
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            name: 'execute_zerion_cli',
            content: stdout || stderr,
          },
        ],
      });

      await loadingMsg.edit(finalResponse.choices[0].message.content);
    } else {
      await loadingMsg.edit(completion.content);
    }
  } catch (error) {
    console.error(error);
    await loadingMsg.edit('An error occurred while communicating with Zerion AI.');
  }
});

client.login(process.env.DISCORD_TOKEN);
```

---

## 2. Telegram Bot Implementation (Node.js)

For Telegram, you can use the `telegraf` library using a very similar architecture to the Discord bot.

### Prerequisites
Installs:
```bash
npm install telegraf openai
```

### Boilerplate `telegram-bot.js`

```javascript
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tools = [
  {
    type: 'function',
    function: {
      name: 'execute_zerion_cli',
      description: 'Run the zerion CLI to evaluate wallets, tokens, and PnL.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The exact zerion CLI command to run (e.g., "zerion portfolio <address>").'
          }
        },
        required: ['command']
      }
    }
  }
];

bot.command('zerion', async (ctx) => {
  const userQuery = ctx.message.text.replace('/zerion', '').trim();
  if (!userQuery) return ctx.reply('Please provide a prompt. Example: /zerion What is the portfolio of vitalik.eth?');

  const loadingMsg = await ctx.reply('Reviewing blockchain data...');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: userQuery }],
      tools: tools
    });

    const completion = response.choices[0].message;

    if (completion.tool_calls) {
      const toolCall = completion.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments);

      const { stdout, stderr } = await execAsync(args.command);
      
      const finalResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: userQuery },
          completion,
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            name: 'execute_zerion_cli',
            content: stdout || stderr
          }
        ]
      });

      await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, finalResponse.choices[0].message.content);
    } else {
      await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, completion.content);
    }
  } catch (error) {
    console.error(error);
    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, 'An error occurred during evaluation.');
  }
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
```

---

## Alternative Solutions

Instead of custom Node.js scripts, you can integrate the `zerion` skills inside comprehensive multi-agent frameworks that feature native chat integration, such as:
- **[Eliza](https://github.com/elizaOS/eliza)**: Supports native Discord, Twitter, and Telegram clients by importing your LLM tasks.
- **[LangChain](https://js.langchain.com/) / LangGraph**: Offers extensive tool wrapping using predefined Node/Python chains.
