import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  ISeriesPrimitive,
  ISeriesPrimitiveBase,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  IChartApiBase,
  LogicalRangeChangeEventHandler,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';

import type { UtcSessionBandDef } from '@/lib/amdHistorySessionUtcBands';

class BandsPaneRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(
    private readonly chart: IChartApiBase,
    private readonly bands: readonly UtcSessionBandDef[]
  ) {}

  drawBackground(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace((scope) => {
      const { context: ctx } = scope;
      const { height } = scope.mediaSize;
      const ts = this.chart.timeScale();
      for (const band of this.bands) {
        const x1 = ts.timeToCoordinate(band.fromSec as unknown as Time);
        const x2 = ts.timeToCoordinate(band.toSec as unknown as Time);
        if (x1 == null || x2 == null) continue;
        const left = Math.min(x1, x2);
        const w = Math.max(1, Math.abs(x2 - x1));
        ctx.fillStyle = band.fillCss;
        ctx.fillRect(left, 0, w, height);
      }
    });
  }

  draw(): void {}
}

class BandsPaneView implements ISeriesPrimitivePaneView {
  zOrder(): 'bottom' {
    return 'bottom';
  }

  constructor(private readonly paneRenderer: ISeriesPrimitivePaneRenderer | null) {}

  renderer(): ISeriesPrimitivePaneRenderer | null {
    return this.paneRenderer;
  }
}

/** Draws translucent UTC session bands behind candlesticks while zoom/pan stays responsive. */
export function createUtcSessionBandsPrimitive(
  bands: readonly UtcSessionBandDef[]
): ISeriesPrimitive<Time> {
  const state: {
    chart: IChartApiBase | null;
    requestUpdate: () => void;
    onRangeChange: LogicalRangeChangeEventHandler | null;
  } = { chart: null, requestUpdate: () => {}, onRangeChange: null };

  const impl: ISeriesPrimitiveBase<
    SeriesAttachedParameter<Time, SeriesType>
  > = {
    attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
      state.chart = param.chart;
      state.requestUpdate = param.requestUpdate;
      state.onRangeChange = () => param.requestUpdate();
      param.chart.timeScale().subscribeVisibleLogicalRangeChange(state.onRangeChange);
    },

    detached(): void {
      if (state.chart && state.onRangeChange) {
        state.chart.timeScale().unsubscribeVisibleLogicalRangeChange(state.onRangeChange);
      }
      state.chart = null;
      state.onRangeChange = null;
    },

    paneViews(): BandsPaneView[] {
      const chart = state.chart;
      const rendererInst = chart
        ? new BandsPaneRenderer(chart, bands)
        : null;
      return [new BandsPaneView(rendererInst)];
    },
  };

  return impl as ISeriesPrimitive<Time>;
}
