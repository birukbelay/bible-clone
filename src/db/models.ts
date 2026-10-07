import { associations, Model, type Query, type Relation } from '@nozbe/watermelondb';
import { children, date, field, readonly, relation, text } from '@nozbe/watermelondb/decorators';

/** Shared columns of every synced record. */
abstract class SyncedRecord extends Model {
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

/** A record attached to a verse range (ari .. ari_end, inclusive). */
abstract class VerseRecord extends SyncedRecord {
  @field('ari') ari!: number;
  @field('ari_end') ariEnd!: number;
}

export class Bookmark extends VerseRecord {
  static table = 'bookmarks';

  @field('version_id') versionId!: string | null;
  @text('title') title!: string | null;
}

export class Note extends VerseRecord {
  static table = 'notes';

  @field('version_id') versionId!: string | null;
  @field('body') body!: string;
}

export class Highlight extends VerseRecord {
  static table = 'highlights';

  /** index into HighlightColors */
  @field('color') color!: number;
}

export class Tag extends SyncedRecord {
  static table = 'tags';
  static associations = associations(['verse_tags', { type: 'has_many', foreignKey: 'tag_id' }]);

  @text('name') name!: string;
  @field('color') color!: string;
  @children('verse_tags') verseTags!: Query<VerseTag>;
}

export class VerseTag extends VerseRecord {
  static table = 'verse_tags';
  static associations = associations(['tags', { type: 'belongs_to', key: 'tag_id' }]);

  @field('tag_id') tagId!: string;
  @relation('tags', 'tag_id') tag!: Relation<Tag>;
}

export type TopicMode = 'any' | 'all';

/** A user-defined subject ("Wisdom") made of several Strong's numbers. */
export class Topic extends SyncedRecord {
  static table = 'topics';
  static associations = associations(['topic_strongs', { type: 'has_many', foreignKey: 'topic_id' }]);

  @text('name') name!: string;
  @text('description') description!: string | null;
  @field('mode') mode!: TopicMode;
  @children('topic_strongs') words!: Query<TopicStrong>;
}

export class TopicStrong extends SyncedRecord {
  static table = 'topic_strongs';
  static associations = associations(['topics', { type: 'belongs_to', key: 'topic_id' }]);

  @field('topic_id') topicId!: string;
  @field('strong') strong!: string;
  @text('note') note!: string | null;
  @relation('topics', 'topic_id') topic!: Relation<Topic>;
}

/** A reading plan: chapters split into days, starting at startDate. */
export class Plan extends SyncedRecord {
  static table = 'plans';
  static associations = associations(['plan_readings', { type: 'has_many', foreignKey: 'plan_id' }]);

  @text('name') name!: string;
  /** local midnight of day 1, ms */
  @field('start_date') startDate!: number;
  @field('active') active!: boolean;
  @field('reminder_enabled') reminderEnabled!: boolean;
  /** "HH:MM" */
  @field('reminder_time') reminderTime!: string;
  @field('chapters_per_day') chaptersPerDay!: number;
  @children('plan_readings') readings!: Query<PlanReading>;
}

/** One reading of a plan ("Mat 1-3"), due on day `day` (0 = start date). */
export class PlanReading extends VerseRecord {
  static table = 'plan_readings';
  static associations = associations(['plans', { type: 'belongs_to', key: 'plan_id' }]);

  @field('plan_id') planId!: string;
  @field('position') position!: number;
  @field('day') day!: number;
  @field('label') label!: string;
  /** ms, null = not read */
  @field('read_at') readAt!: number | null;
  @relation('plans', 'plan_id') plan!: Relation<Plan>;
}

/** A verse being memorized (Leitner boxes: the level sets the days until the next review). */
export class MemoryVerse extends VerseRecord {
  static table = 'memory_verses';

  @field('version_id') versionId!: string | null;
  @field('level') level!: number;
  /** local midnight, ms */
  @field('next_due') nextDue!: number;
  @field('last_reviewed') lastReviewed!: number | null;
}

/** A prayer request, optionally resting on a verse. */
export class Prayer extends SyncedRecord {
  static table = 'prayers';

  @text('title') title!: string;
  @text('body') body!: string | null;
  @field('ari') ari!: number | null;
  @field('ari_end') ariEnd!: number | null;
  /** ms, null = not answered yet */
  @field('answered_at') answeredAt!: number | null;
}

export const modelClasses = [
  Bookmark,
  Note,
  Highlight,
  Tag,
  VerseTag,
  Topic,
  TopicStrong,
  Plan,
  PlanReading,
  MemoryVerse,
  Prayer,
];
