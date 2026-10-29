import type { Status } from '../status.js';
import { readNight } from '../digest/reader.js';

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {status.nights.map((night) => {
            const digest = readNight('runs', night);
            const ok = digest?.rows.filter((row) => row.lastStatus === 'ok').length ?? 0;
            const retries = digest?.rows.reduce((total, row) => total + row.retries, 0) ?? 0;
            const failures = digest?.rows.filter((row) => row.hasFailure).length ?? 0;
            return (
              <li>
                <a href={`/digest/${night}`}>{night}</a>
                <span class="mute"> · ok {ok} · retry {retries} · fail {failures}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
