# wassail

[![npm version](https://img.shields.io/npm/v/wassail.svg?color=blue&logo=npm)](https://www.npmjs.com/package/wassail)  
[![license](https://img.shields.io/github/license/snally-labs/wassail)](https://github.com/snally-labs/wassail/blob/main/LICENSE)  
![node-current](https://img.shields.io/node/v/wassail)

Advent of Code toolkit for Node.js.  
A minimal CLI that fetches your puzzle input using an `AOC_SESSION` cookie.

---

## Install

```bash
npm i -g wassail
```

---

## Usage

```bash
# Export your Advent of Code session cookie
export AOC_SESSION=your_session_cookie

# Fetch today's input
wassail

# Fetch a specific year/day
wassail --year 2025 --day 1
```

---

## Options

```
-y, --year   Year of the puzzle (defaults to current year)
-d, --day    Day of the puzzle (defaults to 1)
-h, --help   Show help
```

---

## Requirements

- Node.js **18 or newer** (uses built-in `fetch`)
- A valid `AOC_SESSION` cookie from adventofcode.com

### How to get your session token

1. Log in to [Advent of Code](https://adventofcode.com) in your browser.
2. Open **Developer Tools → Application/Storage → Cookies**.
3. Copy the value of the cookie named **`session`**.
4. Set it in your environment:
   ```bash
   export AOC_SESSION=your_session_cookie
   ```

---

## Notes

- Input is printed to **stdout** so you can redirect it:
  ```bash
  wassail --year 2025 --day 1 > input.txt
  ```
- Please cache your inputs locally and avoid excessive requests.
- MIT License

---

🔗 [Advent of Code](https://adventofcode.com) | [Report Issues](https://github.com/snally-labs/wassail/issues)
