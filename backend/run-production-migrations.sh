#!/bin/bash

# Production database credentials
DB_HOST="127.0.0.1"
DB_USER="duris"
DB_PASSWORD="duris"
DB_NAME="duris_prod"

MIGRATIONS_DIR="./migrations"

echo "=========================================="
echo "Running migrations on PRODUCTION database"
echo "Database: $DB_NAME"
echo "=========================================="
echo ""

# Run each SQL migration in order
for migration in $(ls $MIGRATIONS_DIR/*.sql | sort); do
    echo "Running: $(basename $migration)"
    mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$migration"

    if [ $? -eq 0 ]; then
        echo "✅ Success: $(basename $migration)"
    else
        echo "❌ Failed: $(basename $migration)"
        echo "Do you want to continue? (y/n)"
        read -r response
        if [ "$response" != "y" ]; then
            exit 1
        fi
    fi
    echo ""
done

echo "=========================================="
echo "All migrations completed!"
echo "=========================================="
