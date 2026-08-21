import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv

load_dotenv()

from db.models import User
from db.session import SessionLocal
from services.broker_service import NoBrokerConnectionError
from services.signal_service import run_signal_for_user


def run(email: str, symbol: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            print(f"No user found with email {email}")
            return
        try:
            result = run_signal_for_user(db, user.id, symbol)
        except NoBrokerConnectionError as exc:
            print(str(exc))
            return
    finally:
        db.close()

    print(f"\n=== {result['symbol']} ({result['asset_name'] or 'unknown instrument'}) ===")
    print(f"Price at call: {result['price_at_call']}")
    print(f"Metrics: {result['metrics']}")
    print(f"Rounds debated: {result['round']}")

    for i, (bull, bear) in enumerate(zip(result["bull_args"], result["bear_args"]), start=1):
        print(f"\n--- Round {i} ---")
        print(f"BULL: {bull}")
        print(f"BEAR: {bear}")

    print(f"\n=== Decision: {result['decision']} (confidence {result['confidence']:.2f}) ===")
    print(result["rationale"])


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python scripts/run_signal.py <user-email> <symbol>")
        sys.exit(1)
    run(sys.argv[1], sys.argv[2])
