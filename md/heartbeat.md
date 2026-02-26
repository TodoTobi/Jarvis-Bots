# Heartbeat

## System Monitor Configuration
- Check interval: 30 seconds
- Report bot states every: 60 seconds
- Auto-pause bots during high CPU/GPU usage: enabled

## Resource Limits
- Max CPU usage by bots: 30%
- Max GPU usage by bots: 20%
- Priority: User applications > Bot tasks

## Health Checks
- Verify LM Studio connectivity on startup
- Log bot status changes
- Alert on consecutive failures (3+)
