import React, { useCallback } from "react";
import SwipeableViews from "react-swipeable-views";

interface SwipeablePagesProps {
  index: number;
  onChangeIndex: (index: number) => void;
  children: React.ReactNode[];
}

export default function SwipeablePages({ index, onChangeIndex, children }: SwipeablePagesProps) {
  return (
    <SwipeableViews
      index={index}
      onChangeIndex={onChangeIndex}
      resistance
      springConfig={{ duration: '0.5s', easeFunction: 'cubic-bezier(0.2,0,0.2,1)', delay: '0s' }}
      style={{ height: "100%" }}
      containerStyle={{ height: "100%" }}
    >
      {children}
    </SwipeableViews>
  );
}
