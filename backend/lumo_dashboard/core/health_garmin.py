"""Garmin data wrapper using garth."""

import logging
from datetime import date, timedelta
from pathlib import Path

log = logging.getLogger(__name__)

try:
    import garth  # type: ignore[import]
    _GARTH_AVAILABLE = True
except ImportError:
    _GARTH_AVAILABLE = False
    log.warning("garth not installed — Garmin features disabled")

_GARTH_DIR = Path.home() / ".garth"
_ERR_NOT_INSTALLED = {"error": "garth not installed"}
_ERR_NOT_CONNECTED = {"error": "not connected"}


class _GarminClient:
    """Singleton wrapper around garth."""

    def is_connected(self) -> bool:
        if not _GARTH_AVAILABLE:
            return False
        try:
            if not _GARTH_DIR.exists():
                return False
            garth.resume(str(_GARTH_DIR))
            garth.client.username  # triggers token refresh if needed
            return True
        except Exception:
            return False

    def login(self, email: str, password: str) -> bool:
        if not _GARTH_AVAILABLE:
            return False
        try:
            garth.login(email, password)
            garth.save(str(_GARTH_DIR))
            return True
        except Exception as exc:
            log.error("Garmin login failed: %s", exc)
            return False

    def sync_today(self) -> dict:
        if not _GARTH_AVAILABLE:
            return _ERR_NOT_INSTALLED
        if not self.is_connected():
            return _ERR_NOT_CONNECTED
        try:
            today = date.today()
            today_str = today.isoformat()
            result: dict = {"date": today_str}

            # Sleep
            try:
                sleep_data = garth.SleepData.get(today_str)
                result["sleep_score"] = getattr(sleep_data, "score", None)
                result["resting_hr"] = getattr(sleep_data, "resting_heart_rate", None)
            except Exception as e:
                log.debug("sleep fetch failed: %s", e)

            # HRV
            try:
                hrv_data = garth.DailyHRV.get(today_str)
                weekly_avg = getattr(hrv_data, "weekly_avg", None)
                last_night = getattr(hrv_data, "last_night", None)
                result["hrv_avg"] = last_night or weekly_avg
            except Exception as e:
                log.debug("hrv fetch failed: %s", e)

            # Body battery
            try:
                bb_list = garth.DailyBodyBattery.get(today_str)
                if bb_list:
                    values = [getattr(b, "body_battery_level", None) for b in bb_list if getattr(b, "body_battery_level", None) is not None]
                    result["body_battery_max"] = max(values) if values else None
            except Exception as e:
                log.debug("body battery fetch failed: %s", e)

            # Stress
            try:
                stress_data = garth.DailyStress.get(today_str)
                avg_stress = getattr(stress_data, "avg_stress_level", None)
                result["stress_avg"] = avg_stress
            except Exception as e:
                log.debug("stress fetch failed: %s", e)

            # Steps
            try:
                steps_data = garth.DailySteps.get(today_str)
                result["steps"] = getattr(steps_data, "total_steps", None)
            except Exception as e:
                log.debug("steps fetch failed: %s", e)

            return result
        except Exception as exc:
            log.error("sync_today error: %s", exc)
            return {"error": str(exc)}

    def get_history(self, days: int = 7) -> list[dict]:
        if not _GARTH_AVAILABLE:
            return [_ERR_NOT_INSTALLED]
        if not self.is_connected():
            return [_ERR_NOT_CONNECTED]
        results = []
        today = date.today()
        for i in range(days):
            target = today - timedelta(days=i)
            target_str = target.isoformat()
            row: dict = {"date": target_str}
            try:
                sleep_data = garth.SleepData.get(target_str)
                row["sleep_score"] = getattr(sleep_data, "score", None)
                row["resting_hr"] = getattr(sleep_data, "resting_heart_rate", None)
            except Exception:
                pass
            try:
                hrv_data = garth.DailyHRV.get(target_str)
                row["hrv_avg"] = getattr(hrv_data, "last_night", None) or getattr(hrv_data, "weekly_avg", None)
            except Exception:
                pass
            try:
                bb_list = garth.DailyBodyBattery.get(target_str)
                if bb_list:
                    values = [getattr(b, "body_battery_level", None) for b in bb_list if getattr(b, "body_battery_level", None) is not None]
                    row["body_battery_max"] = max(values) if values else None
            except Exception:
                pass
            try:
                stress_data = garth.DailyStress.get(target_str)
                row["stress_avg"] = getattr(stress_data, "avg_stress_level", None)
            except Exception:
                pass
            try:
                steps_data = garth.DailySteps.get(target_str)
                row["steps"] = getattr(steps_data, "total_steps", None)
            except Exception:
                pass
            results.append(row)
        return results


# Module-level singleton
garmin_client = _GarminClient()
