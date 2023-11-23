import { NestFactory, Reflector } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import config from './common/config.yaml';
import { HmacAuthGuard } from './common/middleware/hmac.authguard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: { retryAttempts: 3, retryDelay: 1000 },
  });
  const cfg = config();

  if (!cfg.appconfig || !cfg.appconfig.secret || !cfg.appconfig.key)
    throw new Error('Invalid or no api key and secret provided!');

  const reflector = app.get(Reflector);
  app.useGlobalGuards(new HmacAuthGuard(cfg.appconfig.secret, cfg.appconfig.key, reflector));

  if (!cfg.appconfig.port) throw new Error('Invalid or no port provided!');
  await app.startAllMicroservices();
  await app.listen(cfg.appconfig.port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
