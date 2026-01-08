/// <cts-enable />
import { Default, Writable } from "commontools";

/**
 * Link Collections - Data Types
 *
 * An Are.na-style link collection system.
 * Links can belong to multiple collections (many-to-many).
 * Links can have bidirectional relationships with other links.
 *
 * NOTE: [ID] is system-managed - do NOT include in interfaces.
 */

// A saved URL with metadata
export interface Link {
  title: string;
  url: string;
  description: Default<string, "">;
  relatedLinks: Default<Link[], []>; // Bidirectional relationships
  createdAt: Default<number, 0>;
}

// A collection that groups links together
export interface Collection {
  name: string;
  description: Default<string, "">;
  links: Default<Link[], []>;
  createdAt: Default<number, 0>;
}

// Main pattern input/output
export interface LinkCollectionsInput {
  collections: Writable<Default<Collection[], []>>;
  allLinks: Writable<Default<Link[], []>>;
}

export interface LinkCollectionsOutput {
  collections: Writable<Default<Collection[], []>>;
  allLinks: Writable<Default<Link[], []>>;
}

// Collection detail pattern input
export interface CollectionDetailInput {
  collection: Writable<Collection>;
  allLinks: Writable<Link[]>;
  allCollections: Writable<Collection[]>;
}

export interface CollectionDetailOutput {
  collection: Writable<Collection>;
}
