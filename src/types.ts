import { UnknownExtra } from '@graasp/sdk';

export interface EtherpadPluginOptions {
  /** URL (incl. protocol and port) of the etherpad server */
  url: string;
  /** Public URL (incl. protocol and port) of the etherpad server, e.g.
   *  if the back-end communicates with the etherpad service through a
   *  private network (optional, will default to {@link url})
   */
  publicUrl?: string;
  /** secret api key to authorize this app against the etherpad server */
  apiKey: string;
}

export interface EtherpadExtra extends UnknownExtra {
  etherpad: {
    padID: string;
    groupID?: string; // if a pad does not have group ID, then it is a public-access pad
  };
}
