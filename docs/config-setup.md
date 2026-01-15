# Configuration

The application loads configuration from:
1. Environment variables (highest priority)
2. `src/config/config.json` file
3. Default values

## Config File Location

- Development: `src/config/config.json`
- Production: The config.json is loaded from the same location relative to the compiled code

## Environment Variables

All config values can be overridden with environment variables. See `src/config/index.ts` for available options.

