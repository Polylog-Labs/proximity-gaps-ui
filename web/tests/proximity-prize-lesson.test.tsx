import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import App from '../src/App';
import { ExperimentProvider } from '../src/state/ExperimentContext';
import { defaultExperiment, experimentUrl } from '../src/state/model';
import { DEFAULT_PRIZE } from '../src/core/proximityPrize';

function start() {
  window.history.replaceState(null, '', experimentUrl('proximity-prize', defaultExperiment()));
  return render(
    <ExperimentProvider>
      <App />
    </ExperimentProvider>,
  );
}
it('shows eight aligned coordinates and a qualifying seven-point S, and shares edited field values', async () => {
  const user = userEvent.setup();
  const { container, unmount } = start();
  expect(await screen.findByRole('slider', { name: 'Delta' })).toHaveValue('2');
  expect(screen.getByTestId('prize-pair-count')).toHaveTextContent('2/17');
  expect(screen.getByText('7 of 8 points · need at least 6')).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Prize MCA result' })).toHaveTextContent('MCA error');
  expect(
    within(screen.getByRole('group', { name: 'All 17 alpha values' })).getAllByRole('button'),
  ).toHaveLength(17);
  for (const label of ['Vector f', 'Vector g', 'Combination h'])
    expect(
      screen.getByLabelText(label, { selector: 'tr' }).querySelectorAll('.mca-cell'),
    ).toHaveLength(8);
  await user.click(screen.getByRole('checkbox', { name: 'Only show S' }));
  expect(
    screen.getByLabelText('Combination h', { selector: 'tr' }).querySelectorAll('.mca-cell'),
  ).toHaveLength(7);
  await user.click(screen.getByRole('button', { name: 'Reset example' }));
  expect(screen.getByRole('checkbox', { name: 'Only show S' })).not.toBeChecked();
  const alpha = screen.getByRole('spinbutton', { name: 'Prize alpha, position 1' });
  fireEvent.change(alpha, { target: { value: '27' } });
  fireEvent.blur(alpha);
  expect(alpha).toHaveValue(10);
  const symbol = screen.getByRole('spinbutton', { name: 'Prize f, position 7, x = 13' });
  fireEvent.change(symbol, { target: { value: '24' } });
  fireEvent.blur(symbol);
  expect(symbol).toHaveValue(7);
  const saved = JSON.parse(new URLSearchParams(window.location.search).get('s')!);
  expect(saved.prize).toEqual({ ...DEFAULT_PRIZE, alpha: 10 });
  expect(container.querySelector('.katex-error')).toBeNull();
  unmount();
  render(
    <ExperimentProvider>
      <App />
    </ExperimentProvider>,
  );
  expect(await screen.findByRole('spinbutton', { name: 'Prize alpha, position 1' })).toHaveValue(
    10,
  );
  expect(screen.getByRole('spinbutton', { name: 'Prize f, position 7, x = 13' })).toHaveValue(7);
});

it('keeps vectors fixed across thresholds and distinguishes pair probabilities from a worst-case bound', async () => {
  const user = userEvent.setup();
  start();
  const delta = await screen.findByRole('slider', { name: 'Delta' });
  expect(screen.getByText(/worst case over all input pairs is not computed/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delta 5/8, pair error 8/17' }));
  expect(delta).toHaveValue('5');
  expect(screen.getByTestId('prize-pair-count')).toHaveTextContent('8/17');
  expect(screen.getByRole('status', { name: 'Prize target' })).toHaveTextContent(
    'Pair target exceeded',
  );
  const saved = JSON.parse(new URLSearchParams(window.location.search).get('s')!).prize;
  expect(saved.f).toEqual(DEFAULT_PRIZE.f);
  expect(saved.g).toEqual(DEFAULT_PRIZE.g);
  fireEvent.change(delta, { target: { value: '0' } });
  expect(screen.getByTestId('prize-pair-count')).toHaveTextContent('0/17');
  expect(screen.getByRole('status', { name: 'Prize MCA result' })).toHaveTextContent(
    'No qualifying agreement',
  );
  expect(screen.queryByRole('button', { name: 'Show MCA error' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Reset example' }));
  await user.click(screen.getByRole('button', { name: 'Alpha 2: MCA agreement' }));
  expect(screen.getByText('6 of 8 points · need at least 6')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Show MCA error' }));
  expect(screen.getByText('7 of 8 points · need at least 6')).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Prize MCA result' })).toHaveTextContent('MCA error');
});
