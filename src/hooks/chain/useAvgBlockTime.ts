import { BlockHash } from '@polkadot/types/interfaces';
import { $api } from 'boot/api';
import { DateTime } from 'luxon';
import { computed, ref, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { useCurrentEra } from '../useCurrentEra';

export const useAvgBlockTime = (path: string) => {
  const { blockPerEra, era, progress, nextEraStartingBlock } = useCurrentEra();

  const avgBlockTime1Era = ref<number>(0);
  const avgBlockTime7Eras = ref<number>(0);
  const avgBlockTime30Eras = ref<number>(0);
  const latestBlock = ref<number>(0);
  const internalLatestBlock = ref<number>(0);
  const blocksUntilNextEra = ref<number>(0);
  const etaNextEra = ref<string>('');
  const isLoading = ref<boolean>(true);

  const router = useRouter();
  const currentPath = computed(() => router.currentRoute.value.path.split('/')[1]);
  const isUnsubscribe = computed(() => currentPath.value !== path);

  const updateBlock = () => {
    $api.value?.derive.chain.subscribeNewHeads((header) => {
      try {
        const blockHeight = Number(header.number);
        internalLatestBlock.value = blockHeight;
        if (latestBlock.value > 0) {
          latestBlock.value = blockHeight;
        }
      } catch (error) {
        console.error(error);
      }
    });
  };

  const setLatestBlock = (): void => {
    if (avgBlockTime7Eras.value > 0 && latestBlock.value === 0) {
      const delay = 600;
      setTimeout(() => {
        latestBlock.value = internalLatestBlock.value;
      }, delay);
    }
  };

  const getAvgBlockTime = async ({
    hash,
    tsNow,
    blockHeight,
    blockErasAgo,
  }: {
    hash: BlockHash;
    tsNow: number;
    blockHeight: number;
    blockErasAgo: number;
  }): Promise<number> => {
    const block = await $api.value!.at(hash);
    const tsBlockTimeAgo = await block.query.timestamp.now();
    const spentSecs = (tsNow - tsBlockTimeAgo.toNumber()) / 1000;
    return spentSecs / (blockHeight - blockErasAgo);
  };

  const updateAvgBlock = async (blockHeight: number): Promise<void> => {
    const blockPerEraRef = blockPerEra.value;
    if (!blockPerEraRef || blockHeight === 0) {
      return;
    }

    try {
      const block1Era = blockPerEraRef * 1;
      const block7Eras = blockPerEraRef * 7;
      const block30Eras = blockPerEraRef * 30;
      const block1EraAgo = blockHeight - block1Era;
      const block7ErasAgo = blockHeight - block7Eras;
      const block30EraAgo = blockHeight - block30Eras;

      const [tsNow, hashBlock1EraAgo, hashBlock7ErasAgo, hashBlock30ErasAgo] = await Promise.all([
        $api.value!.query.timestamp.now(),
        $api.value!.rpc.chain.getBlockHash(block1EraAgo),
        $api.value!.rpc.chain.getBlockHash(block7ErasAgo),
        $api.value!.rpc.chain.getBlockHash(block30EraAgo),
      ]);

      const numTsNow = tsNow.toNumber();
      const [avg1Era, avg7Eras, avg30Eras] = await Promise.all([
        getAvgBlockTime({
          hash: hashBlock1EraAgo,
          tsNow: numTsNow,
          blockHeight,
          blockErasAgo: block1EraAgo,
        }),
        getAvgBlockTime({
          hash: hashBlock7ErasAgo,
          tsNow: numTsNow,
          blockHeight,
          blockErasAgo: block7ErasAgo,
        }),
        getAvgBlockTime({
          hash: hashBlock30ErasAgo,
          tsNow: numTsNow,
          blockHeight,
          blockErasAgo: block30EraAgo,
        }),
      ]);

      avgBlockTime1Era.value = avg1Era;
      avgBlockTime7Eras.value = avg7Eras;
      avgBlockTime30Eras.value = avg30Eras;

      blocksUntilNextEra.value = nextEraStartingBlock.value - blockHeight;
      const countdownNextEraSecs = blocksUntilNextEra.value * avgBlockTime1Era.value;
      etaNextEra.value = DateTime.local()
        .plus(countdownNextEraSecs * 1000)
        .toFormat('HH:mm dd-MMM');
      if (isLoading.value) {
        isLoading.value = false;
      }
    } catch (error) {
      console.error(error);
    }
  };

  updateBlock();

  watchEffect(async () => {
    if (internalLatestBlock.value > 0 && !isUnsubscribe.value) {
      await updateAvgBlock(internalLatestBlock.value);
    }
  });

  watchEffect(() => {
    setLatestBlock();
  });

  return {
    avgBlockTime1Era,
    avgBlockTime7Eras,
    avgBlockTime30Eras,
    latestBlock,
    era,
    blocksUntilNextEra,
    progress,
    etaNextEra,
    isLoading,
  };
};