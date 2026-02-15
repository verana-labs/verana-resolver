#!/bin/sh
set -e

# Validate required environment variables
REQUIRED_VARS="
POSTGRES_HOST
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
REDIS_URL
INDEXER_API
"

echo "Validating environment variables..."
missing_vars=""

for var in $REQUIRED_VARS; do
    val=$(eval echo "\$$var")
    if [ -z "$val" ]; then
        missing_vars="$missing_vars $var"
        echo "ERROR: Missing required environment variable: $var"
    fi
done

if [ -n "$missing_vars" ]; then
    echo "FATAL: Required environment variables are missing:$missing_vars"
    echo "Please configure these variables in your deployment."
    exit 1
fi

echo "Environment validation passed"
echo "Starting Verana Trust Resolver"
exec "$@"
