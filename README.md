# Circuit for OpenClaw

Use the models your [Circuit](https://www.circuitry.dev/download) shares from [OpenClaw](https://docs.openclaw.ai): models on the computer running OpenClaw, on your other computers, and on every computer in your Circuit cluster.

**Running OpenClaw inside Circuitry? You don't need this plugin.** Circuitry gives it your Circuit's models automatically: install Circuit on each computer and put them in a cluster. This plugin is for OpenClaw running on its own.

Your Mac has MLX and Ollama models and your PC has a GPU? Pair OpenClaw with one Circuit and both computers' models appear in OpenClaw, under one provider.

```
OpenClaw ──> your lead Circuit ──┬──> its own models
                                 └──> Circuit on your PC ──> the PC's models
```

## What you need

- OpenClaw 2026.10.9 or newer
- Circuit with app pairing, on the computer you pair with. It updates itself; if pairing says it is too old, choose the update in its menu.
- Both computers on the same network, with Circuit allowed through the firewall

To reach your whole cluster, pair with the **lead** Circuit: the one you add machines from under **Cluster…** in the Circuit menu. A computer in a cluster only knows its own models.

## Install

```
openclaw plugins install git:github.com/johnwylie70/openclaw-circuit
```

OpenClaw warns that the source is outside ClawHub and asks you to accept what the plugin does. Without a terminal to answer, add `--force --accept-capabilities`.

## Pair

```
openclaw models auth login --provider circuit
```

1. Type your Circuit's address, the **IP Address** in its menu, such as `192.168.1.20`.
2. A window opens on that computer, naming the app and the computer asking, with a 6-digit code.
3. Type the code into OpenClaw. If you did not start this, press **Not me** in the window.

Then restart the gateway so it picks up the models:

```
openclaw gateway restart
```

## Use a model

```
openclaw models list --provider circuit --refresh
openclaw models set circuit/gemma4:latest
```

A model on the computer running your Circuit is `circuit/<model>`. A model on another computer in the cluster is `circuit/<computer>/<model>`, such as `circuit/pc/qwen3.8:27b`.

## What OpenClaw can reach

The key from pairing reaches two things: the list of shared models, and chats with them. It cannot reach files, terminals or code on your computers, and it cannot run anything there. It is kept in OpenClaw's protected store, not in `openclaw.json`.

To remove access, choose **Cluster…** in the Circuit menu and press **Remove** next to OpenClaw. The key stops working at once. Pair again to get a new one; that replaces the old key.

Your messages travel between your computers over plain HTTP on your own network, as all Circuit traffic on a network does. Use a network you trust.

## How much context a model gets

OpenClaw needs to know a model's context to decide when to compact a conversation.

| Where the number comes from | When |
|---|---|
| `contextWindows` in this plugin's settings | Always wins |
| The model's server | Only while the model is loaded |
| `defaultContextWindow` in this plugin's settings | Otherwise |
| 64,000 tokens | Otherwise |

So a model that is not loaded yet may show as 64k even if it can hold more. If its server allows less than that, the oldest part of a long conversation can be cut off. If you know its size, set it:

```json5
// openclaw.json
{
  plugins: {
    entries: {
      circuit: {
        config: {
          contextWindows: { "pc/qwen3.8:27b": 160000 }
        }
      }
    }
  }
}
```

`maxTokens` sets the longest reply (8,192 tokens by default).

## When a computer is short of memory

The computer holding the model decides what happens:

- **The model isn't running:** it starts, and the first reply takes longer.
- **Other models are in the way:** they stop to make room. Circuitry shows a message saying which, so you can adjust.
- **It can't make enough room:** nothing stops, and OpenClaw gets a message such as `Big needs about 19 GB but Mac has 6 GB free. Most memory is in use by Chrome (8 GB).`

To try another computer when that happens, list a fallback:

```json5
// openclaw.json
{
  agents: {
    defaults: {
      model: {
        primary: "circuit/Qwen3.8-27B-4bit",
        fallbacks: ["circuit/pc/qwen3.8:27b"]
      }
    }
  }
}
```

Fallbacks apply to your default model. A model you pick for one chat with `/model` runs as chosen, and OpenClaw tells you if it can't.

## Troubleshooting

| You see | What to do |
|---|---|
| `Nothing answered at …` | Check Circuit is running there, and that its firewall allows port 3030 |
| `That Circuit is too old to pair with apps` | Update Circuit from its menu |
| `This Circuit has no screen to show a pairing code on` | Pair with a Circuit running from its menu bar or tray, not the command-line one |
| `That pairing has ended` | It timed out after 5 minutes, took 5 wrong codes, or someone pressed **Not me**. Start again |
| `No models found` | Add `--refresh`, restart the gateway, or check the Circuit shares a model |
| `The model is not answering` | The computer named in the message is off, or its model server isn't reachable |
| Updating the plugin on Windows says `EPERM … symlink` | The update is saved. Restart the gateway from a terminal on that PC, not over SSH |

## Limits

- Text models only: image models aren't listed yet.
- Your computers have to be on the same network. Home Circuit, for reaching a Circuit from outside it, isn't supported.
- OpenClaw reaches your cluster through the lead Circuit, so a model on the PC stops answering while the lead computer sleeps, even with OpenClaw on that same PC.

## Develop

```
npm test
```

No build step and no dependencies: `index.js` and `src/` are what OpenClaw loads. The Circuit's side of pairing is described in [the docs](https://www.circuitry.dev/docs/agent-chat/openclaw).

## Licence

Licensed under the [Circuitry terms](https://www.circuitry.dev/terms). See [LICENSE](LICENSE).
