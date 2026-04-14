# PerpGame Frontend

### Setup

```bash
cd frontend
npm install
```

Also make sure backend is up and running.

### Development

##### Start server locally
```bash
npm run dev
```

### Deployment

##### Set up dokku app

```bash
dokku apps:create perpgame-fe-production
dokku builder-dockerfile:set perpgame-fe-production dockerfile-path frontend/Dockerfile
```

##### Deploy the latest version

```bash
bin/deploy-fe
```
