# Bootstrap

## Startup Sequence
1. Load environment variables from `config/.env`
2. Initialize Logger
3. Load all instruction files from `md/` folder
4. Initialize ModelService (verify LM Studio connection)
5. Initialize BotManager with all registered bots
6. Start Express server on configured PORT
7. Ready to receive user requests

## On Failure
- If LM Studio is unreachable: log error, continue running, retry on next request
- If md folder is missing: throw fatal error, do not start
- If a bot fails to initialize: log warning, skip bot, continue with others
