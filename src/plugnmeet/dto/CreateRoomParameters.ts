import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { LockSettingsParams, RoomFeaturesParams } from 'plugnmeet-sdk-js';

export class CreateConferenceDto {
  @IsString()
  @IsNotEmpty()
  room_id: string;
  @IsNumber()
  @IsOptional()
  max_participants?: number;
  @IsNumber()
  @IsOptional()
  empty_timeout?: number;
  metadata: RoomMetadata;
}
export class RoomExtraData {
  activity: {
    id: string;
    course: string;
  };
}

export class RoomMetadata {
  room_title: string;
  welcome_message?: string;
  extra_data?: string;
  webhook_url?: string;
  logout_url?: string;
  room_features: RoomFeaturesParams;
  default_lock_settings?: LockSettingsParams;
}
