// A line diff for the item view's branch copies (spec §7.2: "the item view shows both, as a
// diff"). Longest common subsequence: items are a few dozen lines, so the square table is cheap.

export interface DiffLine {
	kind: 'same' | 'add' | 'del';
	text: string;
}

export function diffLines(a: string, b: string): DiffLine[] {
	const x = a.replace(/\n$/, '').split('\n');
	const y = b.replace(/\n$/, '').split('\n');
	const n = x.length;
	const m = y.length;
	const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--)
		for (let j = m - 1; j >= 0; j--)
			lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n || j < m) {
		if (i < n && j < m && x[i] === y[j]) {
			out.push({ kind: 'same', text: x[i] });
			i++;
			j++;
		} else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1]))
			out.push({ kind: 'del', text: x[i++] });
		else out.push({ kind: 'add', text: y[j++] });
	}
	return out;
}
