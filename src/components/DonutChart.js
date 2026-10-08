import React from "react";
import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

export default function DonutChart({ size = 104, strokeWidth = 14, segments = [], trackColor = "#eee", children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, seg) => sum + (seg.value || 0), 0);

  let cumulative = 0;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <G rotation="-90" originX={size / 2} originY={size / 2}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
          {total > 0
            ? segments.map((seg, idx) => {
                if (!seg.value) return null;
                const length = (seg.value / total) * circumference;
                const dashOffset = -cumulative;
                cumulative += length;
                return (
                  <Circle
                    key={idx}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={seg.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="butt"
                    fill="none"
                  />
                );
              })
            : null}
        </G>
      </Svg>
      <View style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}>{children}</View>
    </View>
  );
}
