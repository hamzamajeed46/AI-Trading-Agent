# Quorum: what it is, in simple words

## What it is
A website where AI helps you decide on a stock trade, but **you always make the final call**.

You type a stock symbol. A team of AI "agents" studies it and argues about it. Then it gives you a clear suggestion: BUY, SELL, or HOLD. Nothing is bought or sold until you press Approve.

## How it works
1. **Quant agent** looks at the numbers (price, trends, volatility).
2. **Bull agent** argues why the stock could go up.
3. **Bear agent** argues why it could go down.
4. **Manager agent** reads both sides and decides BUY, SELL, or HOLD, with a confidence score.
5. **You approve or reject.** If you approve, a real order goes to your own Alpaca account (paper money for now).

You can watch the agents debate live on the screen.

## What is done so far
- Sign up and log in.
- Connect your own Alpaca account. Your keys are stored encrypted.
- Analyze a stock and watch the debate appear step by step.
- Approve or reject suggestions on an approvals page.
- Approved trades become real orders on a paper account, with a stop-loss and a take-profit built in.
- A pending approval survives a server restart.
- A dark, clean trading-style design.

## What is not done yet
- Checking whether the AI's advice is actually any good (the most important next step).
- Safety checks (expired approvals, no double orders).
- Backtesting on past data.
- Live prices on screen.
- Tracking open trades after they are placed.
- A daily "top ideas" list (see below).
- A "my performance" page and personal tuning (see below).
- Autonomous bots that work for you in the background (see below).

## Where it is going
Today you have to type a stock symbol yourself. Most people do not know which one to type. Two big features are planned:

1. **Top ideas, found for you.** Every day the app quickly screens hundreds of stocks with simple number checks, picks the best 10 to 20, and only then lets the AI agents debate those. You get a short ranked list of today's best ideas, each with the reasoning, a stop-loss, and a target. You still approve every trade. Every idea is also logged and scored later, so the list builds a real track record.
2. **My performance and personal tuning.** The app reads your own Alpaca history (including trades you made yourself): how many trades, gains and losses, win rate, how long you hold. It then adjusts to you: trade sizes that fit your account and risk level, plain feedback such as "you tend to sell winners too early," and warnings after a losing streak. New users start with a default profile.

3. **Autonomous bots working in the background.** This is the big one. Anyone can ask a general chatbot about a stock. What a chatbot cannot do is quietly work for you all day against your own broker account. Here you set the rules once: a budget, a maximum trade size, which stocks are allowed, a daily loss limit, and an end date. The bot then finds and places trades inside those limits without asking each time. You can pause or kill it with one click, and every action is recorded with its reasons. It stays on paper money until its track record earns more trust, and it only starts after the safety pieces exist (kill switch, loss limits, order checks, audit log).

These come after the test that checks whether the AI's advice is actually good. There is no point automating advice that has not been proven.

## Why it could be a different kind of product
Most trading tools do one of two things: give you a signal and leave you alone, or trade fully automatically and take control away from you. This sits in the middle:

- **You stay in control.** The AI suggests, you decide. Nothing trades without your approval.
- **You see the reasoning.** You read the bull and bear arguments, not just a "BUY" label.
- **It uses your own account.** Your money stays with your broker. The app never holds anyone's funds.
- **It finds trades for you and learns about you.** You get a ranked list of ideas instead of guessing tickers, tuned to your account and habits.
- **It can work for you while you are away,** inside limits you set, which a chatbot cannot do.
- **It can prove itself.** Every suggestion is meant to be logged and scored later, so you can see if it really beats just buying and holding.

## Honest status
The system works end to end. What is not proven yet is whether its advice is good. That is what the next phases test. If it does not beat simple buy-and-hold, the idea needs rethinking before more is built.

*This is a learning project on paper money. It is not financial advice.*
