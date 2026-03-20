import React from "react";

interface FlashListRenderInfo<TItem> {
  item: TItem;
  index: number;
  target: "Cell";
  extraData?: unknown;
}

interface FlashListProps<TItem> {
  data?: ReadonlyArray<TItem> | null;
  renderItem?: ((info: FlashListRenderInfo<TItem>) => React.ReactElement | null) | null;
  keyExtractor?: (item: TItem, index: number) => string;
  ItemSeparatorComponent?: React.ComponentType | React.ExoticComponent | null;
}

export function FlashList<TItem>({
  data,
  renderItem,
  keyExtractor,
  ItemSeparatorComponent,
}: FlashListProps<TItem>) {
  const items = data ?? [];

  return React.createElement(
    "FlashList",
    null,
    items.map((item, index) => {
      const content = renderItem?.({ item, index, target: "Cell" }) ?? null;
      const key = keyExtractor?.(item, index) ?? String(index);
      const separator =
        ItemSeparatorComponent && index < items.length - 1
          ? React.createElement(ItemSeparatorComponent, { key: `separator-${key}` })
          : null;

      return React.createElement(React.Fragment, { key }, content, separator);
    }),
  );
}
