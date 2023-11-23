## Description
* Opencast automatic video recording ingestion service. Currently supported video automatic recording uploads from:
    - Epiphan
    - [PlugNMeet](https://github.com/mynaparrot/plugNmeet-server)

## Installation and running the application
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