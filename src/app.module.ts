import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PlugNMeetRoom } from './plugnmeet/entities/PlugNMeetRoom';
import { BullModule } from '@nestjs/bull';
import { PlugNMeetModule } from './plugnmeet/plugnmeet.module';
import { OpencastModule } from './opencast/opencast.module';
import { EpiphanModule } from './epiphan/epiphan.module';
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        type: 'mongodb',
        host: config.getOrThrow<string>('mongodb.host'),
        database: config.getOrThrow<string>('mongodb.database'),
        port: config.getOrThrow<number>('mongodb.port'),
        entities: [PlugNMeetRoom],
        synchronize: true,
        useUnifiedTopology: true,
      }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        redis: {
          host: config.getOrThrow<string>('redis.host'),
          port: config.getOrThrow<number>('redis.port'),
          db: config.getOrThrow<number>('redis.db'),
          username: config.getOrThrow<string>('redis.username'),
          password: config.getOrThrow<string>('redis.password'),
        },
      }),
      inject: [ConfigService],
    }),
    PlugNMeetModule,
    OpencastModule,
    EpiphanModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
