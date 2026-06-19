/**
 * @auriga/chatops — a chat surface over the control plane. Platform-agnostic
 * command parsing + handler (fully tested), plus a Slack adapter (signature
 * verification + slash-command parsing + dispatch). The live Slack flow needs a
 * real Slack app to validate end to end.
 */
export { parseCommand, HELP, type Command } from "./commands";
export { handleCommand, type ChatContext, type ChatReply } from "./handler";
export {
  verifySlackSignature,
  parseSlashCommand,
  handleSlackCommand,
  type SlackRequest,
} from "./slack";
