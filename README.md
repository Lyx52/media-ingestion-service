## Description
* Opencast automatic video recording ingestion service. Currently supported video automatic recording uploads from:
    - Epiphan
    - [PlugNMeet](https://github.com/mynaparrot/plugNmeet-server)
## Pre-requisites
You will need to add workflows (In **workflow** directory) to your opencast configuration to support multiple video combining
# Installation and running the application
Clone repository
```bash
$ git clone https://github.com/Lyx52/media-ingestion-service.git
```
Copy and configure config.yaml according to your needs
```bash
$ cp config_sample.yaml config.yaml
```

Install npm packages
```bash
$ npm ci
```

Start application
```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```