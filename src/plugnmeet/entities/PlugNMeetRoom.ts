import { Column, Entity, ObjectId, ObjectIdColumn } from 'typeorm';
@Entity()
export class PlugNMeetRoom {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  title: string;

  @Column()
  roomSid: string;

  @Column()
  roomId: string;

  @Column()
  course?: string;

  @Column()
  started: Date;

  @Column()
  ended: Date;
  @Column()
  ingested: boolean;
}
