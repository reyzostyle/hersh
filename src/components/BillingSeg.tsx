import { Seg } from './Page';

// Monthly / Yearly, with what yearly is worth printed on the yearly option
// itself. The saving used to appear under the toggle only once Yearly was
// already chosen - telling people about the discount after they had taken it,
// and saying nothing to the ones on Monthly who might have. Amber, the colour
// this product keeps for something on offer.
export function BillingSeg({ interval, onChange, percentOff }: {
  interval: 'month' | 'year';
  onChange: (v: 'month' | 'year') => void;
  percentOff: number;
}) {
  return (
    <Seg
      value={interval}
      onChange={onChange}
      options={[
        { id: 'month', label: 'Monthly' },
        {
          id: 'year',
          label: (
            <span className="inline-flex items-center gap-1.5">
              Yearly
              {percentOff > 0 && (
                <span className="px-1.5 py-px rounded-full text-[11px] font-medium tabular-nums"
                      style={{ background: 'rgba(245,196,81,0.14)', color: 'var(--upgrade)' }}>
                  −{percentOff}%
                </span>
              )}
            </span>
          ),
        },
      ]}
    />
  );
}
