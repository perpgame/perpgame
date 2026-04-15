# PerpGame Backend

### Setup

```bash
# Start Postgres
docker-compose up -d

# Configure environment
cp .env.example .env
# Fill in JWT_SECRET and ENCRYPTION_KEY (e.g. openssl rand -hex 32)

# Install dependencies
npm install

# Prepare database
npm run db:migrate
```

### Development

##### Start server locally
```bash
npm run dev
```

##### Change db structure

1. edit `db/schema.js`
2. run `npm run db:generate -- --name=<name_your_migration_file>`

##### Run tests

```bash
npm test
```

### Deployment

##### Set up dokku app

```bash
app_env=staging # or production
app_name=perpgame-be-$app_env

dokku apps:create $app_name
dokku postgres:create $app_name --image-version 18.1
dokku postgres:link $app_name $app_name

dokku config:set $app_name NODE_ENV=production
dokku config:set $app_name ADMIN_ADDRESSES=<admin-eth-address>
dokku config:set $app_name ANTHROPIC_API_KEY=<antropic-api-key>
dokku config:set $app_name JWT_SECRET=<jwt-secret>

dokku letsencrypt:set $app_name email pauls@plugwallet.ooo
dokku letsencrypt:enable $app_name
dokku letsencrypt:cron-job --add

dokku builder-dockerfile:set $app_name dockerfile-path backend/Dockerfile
dokku ps:set $app_name procfile-path backend/Procfile
```
