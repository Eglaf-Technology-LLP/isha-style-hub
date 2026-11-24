import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  MapPin,
  Package,
  PackageCheck,
  RotateCcw,
  Scissors,
  ShieldCheck,
  Truck,
} from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { formatDateInWordsWithDay, formatDateTimeInWords } from '@/lib/dates';
import { OrderTimeline, TimelineStage } from '@/lib/orderStatus';
import { colors, fonts } from '@/theme';
import { Sans } from './ui';

// The order tracker - the website's OrderStatusTimeline as it shows on a
// phone (ccbdd62): every step top to bottom, each with its date and time
// (client, 24 Nov 2026), then a failed-delivery warning, a note and the
// expected delivery date.

const STAGE_ICONS: Record<TimelineStage['key'], typeof Package> = {
  placed: Package,
  confirmed: CheckCircle2,
  preparing: Scissors,
  quality_check: ShieldCheck,
  shipped: Truck,
  out_for_delivery: MapPin,
  delivered: PackageCheck,
};

const AMBER = '#B45309';

export function OrderStatusTimeline({ timeline }: { timeline: OrderTimeline }) {
  if (timeline.kind === 'cancelled' || timeline.kind === 'returned') {
    const Icon = timeline.kind === 'cancelled' ? Ban : RotateCcw;
    return (
      <View>
        <View style={styles.stopped}>
          <Icon size={16} color={colors.destructive} />
          <Text style={styles.stoppedText}>
            {timeline.kind === 'cancelled' ? 'Order Cancelled' : 'Returned'}
          </Text>
          {timeline.terminalAt ? (
            <Sans style={styles.date}>
              {formatDateTimeInWords(timeline.terminalAt)}
            </Sans>
          ) : null}
        </View>
        {timeline.note ? (
          <Sans style={styles.note}>{timeline.note}</Sans>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.current}>{timeline.currentLabel}</Text>
      {timeline.stages.map((stage, i) => {
        const Icon = STAGE_ICONS[stage.key];
        const isReached = stage.state !== 'upcoming';
        const next = timeline.stages[i + 1];
        return (
          <View key={stage.key} style={styles.step}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  isReached
                    ? stage.state === 'current'
                      ? styles.dotCurrent
                      : styles.dotDone
                    : null,
                ]}
              >
                <Icon
                  size={14}
                  color={
                    !isReached
                      ? colors.mutedForeground
                      : stage.state === 'current'
                      ? colors.primaryForeground
                      : colors.primary
                  }
                />
              </View>
              {next ? (
                <View
                  style={[
                    styles.line,
                    next.state !== 'upcoming' && styles.lineOn,
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.label, !isReached && styles.muted]}>
                {stage.label}
              </Text>
              {stage.date ? (
                <Sans style={styles.date}>
                  {formatDateTimeInWords(stage.date)}
                </Sans>
              ) : null}
            </View>
          </View>
        );
      })}
      {timeline.isNdr ? (
        <View style={styles.ndr}>
          <AlertTriangle size={14} color={AMBER} />
          <Sans style={styles.ndrText}>
            Last delivery attempt failed - a retry is scheduled
          </Sans>
        </View>
      ) : null}
      {timeline.note ? <Sans style={styles.note}>{timeline.note}</Sans> : null}
      {timeline.estimatedDeliveryDate ? (
        <Text style={styles.expected}>
          Expected delivery:{' '}
          {formatDateInWordsWithDay(timeline.estimatedDeliveryDate)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  current: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.foreground,
    marginBottom: 10,
  },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center' },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  dotDone: { backgroundColor: 'rgba(126,54,38,0.15)' },
  dotCurrent: { backgroundColor: colors.primary },
  line: {
    width: 2,
    flex: 1,
    minHeight: 12,
    backgroundColor: colors.muted,
  },
  lineOn: { backgroundColor: 'rgba(126,54,38,0.4)' },
  stepText: { flex: 1, paddingTop: 4, paddingBottom: 12 },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.foreground,
  },
  muted: { color: colors.mutedForeground },
  date: { fontSize: 12, color: colors.mutedForeground, marginTop: 1 },
  stopped: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  stoppedText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.destructive,
  },
  ndr: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  ndrText: { fontSize: 12, color: AMBER, flex: 1 },
  note: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 6,
    lineHeight: 18,
  },
  expected: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.primary,
    marginTop: 8,
  },
});
