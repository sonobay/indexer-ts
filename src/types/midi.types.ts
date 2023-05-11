export type MIDIMetadata = {
  name: string;
  description: string;
  image: string;
  properties: {
    devices?: {
      name: string;
      manufacturer: string;
    }[];
    tags: string[];
    entries: {
      name: string;
      midi: string;
      image: string | undefined;
      tags: string[] | undefined;
    }[];
  };
};

export type MIDIRow = {
  id: number;
  device?: string;
  metadata?: MIDIMetadata;
  createdBy: string;
  deviceIndexAttempts: number;
};
