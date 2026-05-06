// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-cli — help text
// ─────────────────────────────────────────────────────────────────────────────

export const ROOT_HELP = `ergo-agent — command-line companion for ergo-agent-pay

USAGE
  ergo-agent <command> [subcommand] [flags]

COMMANDS
  balance                          show ERG balance for the configured address
  height                           show current Ergo block height
  task-hash <input>                compute BLAKE2b-256 of a task output
                                   (alternatives: --hex, --file, --stdin)
  note check <boxId>               fetch a Note and decode its registers
  note issue ...                   build a Note (--recipient, --value, --reserve, --deadline,
                                   [--task-hash | --task-output], [--credential-key], [--script])
  note redeem ...                  redeem a Note (--box, [--task-output], [--receiver])
  reserve create ...               build a Reserve (--collateral, [--script], [--memo])
  tracker deploy ...               deploy a Tracker (--script)
  settle ...                       batch-redeem Notes (--boxes id1,id2,..., [--task-outputs k=v;...], [--receiver])

GLOBAL FLAGS
  --address <addr>                 agent address (or env ERGO_ADDRESS)
  --network mainnet|testnet        network (or env ERGO_NETWORK; default: testnet)
  --node-url <url>                 custom Ergo API node (or env ERGO_NODE_URL)
  --allow-insecure-dev-mode        permit mainnet ops without a compiled scriptErgoTree
                                   (or env ERGO_ALLOW_INSECURE_DEV_MODE=1) — see SPEC.md §6
  --json                           emit a single JSON object on stdout
  --help, -h                       show this message
  --version                        print the CLI version

EXAMPLES
  ergo-agent task-hash "the answer is 42"
  ergo-agent --address 9... balance
  ergo-agent note check abc123...
  ergo-agent note issue --recipient 9... --value "0.005 ERG" \\
                        --reserve abc... --deadline "+100 blocks" \\
                        --task-output "the answer is 42"
  ergo-agent reserve create --collateral "1 ERG"

For protocol details see SPEC.md; for safety, see SECURITY.md.
`;
