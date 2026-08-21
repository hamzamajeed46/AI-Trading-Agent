import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

from integrations.alpaca_market_data import get_recent_daily_bars
from integrations.alpaca_trading import get_account_summary

if __name__ == "__main__":
    print("=== Alpaca paper account ===")
    account = get_account_summary()
    for key, value in account.items():
        print(f"{key}: {value}")

    print("\n=== AAPL last 5 daily bars ===")
    for bar in get_recent_daily_bars("AAPL", limit=5):
        print(bar)
