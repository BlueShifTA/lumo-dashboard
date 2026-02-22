class MotorNormMode:
    DEGREES: object
    RANGE_0_100: object

class Motor:
    def __init__(self, motor_id: int, model: str, norm_mode: object) -> None: ...

class MotorCalibration:
    def __init__(
        self,
        *,
        id: int,
        drive_mode: int,
        homing_offset: int,
        range_min: int,
        range_max: int,
    ) -> None: ...
