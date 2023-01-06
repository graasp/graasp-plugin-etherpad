import { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { Item, ItemType } from '@graasp/sdk';

import { ETHERPAD_API_VERSION, PLUGIN_NAME } from './constants';
import { ItemMissingExtraError, ItemNotFoundError } from './errors';
import { GraaspEtherpad } from './etherpad';
import { getEtherpadFromItem } from './schemas';
import { EtherpadExtra, EtherpadPluginOptions } from './types';
import { buildPadPath, validatePluginOptions } from './utils';

const publicPlugin: FastifyPluginAsync<EtherpadPluginOptions> = async (fastify, options) => {
  const { public: publicPlugin, taskRunner } = fastify;

  const { url: etherpadUrl, publicUrl, apiKey } = validatePluginOptions(options);

  if (!publicPlugin) {
    throw new Error(`${PLUGIN_NAME}: Public plugin was not registered!`);
  }

  /**
   * This hook ensures that the write ID of an etherpad is never leaked
   * In non-group pad mode, the padID cannot be given to the end user: this would allow
   * anyone to edit them. So we need to repalce the actual ID with a read-only ID, because
   * non-group pads are not authenticated through sessions.
   * 
   * Public Graasp item (publicly visible, but read-only to guests)
   * != non-group pad (publicly visible and editable by guests)
   * so we need to implement additional logic to make sure that guests can only view pad
   * and not retrieve the original ID in some way to edit them
   * (e.g. leakage of etherpad extra)
   */
  const getTaskName = publicPlugin.items.taskManager.createGetPublicItemTaskName();
  taskRunner.setTaskPostHookHandler<Item<EtherpadExtra>>(
    getTaskName,
    async (item, actor, { log, handler }) => {
      // only run when getting etherpad item
      if (item.type !== ItemType.ETHERPAD) {
        return;
      }

      // raise error if extra is missing
      if (!item.extra.etherpad) {
        throw new ItemMissingExtraError(item);
      }
      const { padID } = item.extra.etherpad;

      // in public mode, always replace the pad id with a read-only id
      const { readOnlyID } = await etherpad.getReadOnlyID({ padID }, true);
      // replace content of extra in-place with read-only values
      item.extra.etherpad = {
        padID: readOnlyID,
        groupID: undefined,
      };
    },
  );

  // TODO: do the same for all other get operations

  const {
    graaspActor,
    items: { taskManager: itemTaskManager },
  } = publicPlugin;

  // connect to etherpad server
  const etherpad = new GraaspEtherpad({
    url: etherpadUrl,
    apiKey,
    apiVersion: ETHERPAD_API_VERSION,
  });

  // create a route prefix for etherpad
  await fastify.register(
    async (fastify: FastifyInstance) => {
      /**
       * Etherpad read-only mode
       * Access should be granted if and only if the item is public
       */
      fastify.get<{ Params: { itemId: string } }>(
        '/read/:itemId',
        { schema: getEtherpadFromItem },
        async (request, reply) => {
          const {
            params: { itemId },
          } = request;

          const getItem = itemTaskManager.createGetPublicItemTask(graaspActor, { itemId });
          const item = (await taskRunner.runSingle(getItem)) as Item<Partial<EtherpadExtra>>;

          if (!item) {
            throw new ItemNotFoundError(itemId);
          }

          if (!item.extra?.etherpad) {
            throw new ItemMissingExtraError(item);
          }

          const { padID } = item.extra.etherpad;

          const { readOnlyID } = await etherpad.getReadOnlyID({ padID });
          return { padUrl: buildPadPath({ padID: readOnlyID }, publicUrl) };
        },
      );
    },
    { prefix: 'etherpad' },
  );
};

export default publicPlugin;
