class _State:
    PLAYING: object
    NULL: object

class _StateChangeReturn:
    ASYNC: object

class _MapFlags:
    READ: object

class _MessageType:
    ERROR: object

class _MapInfo:
    data: bytes | bytearray | memoryview

class _CapsStructure:
    def get_value(self, key: str) -> int: ...

class _Caps:
    def get_structure(self, index: int) -> _CapsStructure: ...

class _Buffer:
    def map(self, flags: object) -> tuple[bool, _MapInfo]: ...
    def unmap(self, info: _MapInfo) -> None: ...

class _Sample:
    def get_buffer(self) -> _Buffer: ...
    def get_caps(self) -> _Caps: ...

class _Sink:
    def emit(self, signal: str) -> _Sample | None: ...

class _Message:
    type: object

    def parse_error(self) -> tuple[Exception, object]: ...

class _Bus:
    def add_signal_watch(self) -> None: ...
    def connect(self, signal: str, callback: object) -> None: ...

class _Pipeline:
    def get_by_name(self, name: str) -> _Sink | None: ...
    def get_bus(self) -> _Bus: ...
    def set_state(self, state: object) -> object: ...
    def get_state(self, timeout: int) -> tuple[object, object, object]: ...

class _GstModule:
    SECOND: int
    CLOCK_TIME_NONE: int
    State: _State
    StateChangeReturn: _StateChangeReturn
    MapFlags: _MapFlags
    MessageType: _MessageType

    def init(self, argv: object | None) -> None: ...
    def parse_launch(self, pipeline: str) -> _Pipeline: ...

Gst: _GstModule
