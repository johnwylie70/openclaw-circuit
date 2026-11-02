import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createCircuitProvider } from "./src/provider.js";

export default definePluginEntry({
  id: "circuit",
  name: "Circuit",
  description: "Use the models your Circuit shares, including every computer in your Circuit cluster.",
  register(api) {
    api.registerProvider(createCircuitProvider({ pluginConfig: api.pluginConfig }));
  },
});
