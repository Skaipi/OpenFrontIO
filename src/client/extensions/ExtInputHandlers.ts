import { EventBus, GameEvent } from "../../core/EventBus";
import { BuildableUnit, Cell, UnitType } from "../../core/game/Game";
import { TileRef } from "../../core/game/GameMap";
import { GameView } from "../../core/game/GameView";
import { NukeType } from "../../core/StatsSchemas";
import { GameRenderer } from "../graphics/GameRenderer";
import { BuildItemDisplay, buildTable } from "../graphics/layers/BuildMenu";
import {
  BuildUnitIntentEvent,
  SendUpgradeStructureIntentEvent,
} from "../Transport";

export class NukePreviewEvent implements GameEvent {
  constructor(
    public x: number,
    public y: number,
    public nukeType: NukeType,
    public isActive: boolean,
  ) {}
}

export class ExtInputHandler {
  private cell: Cell;
  private renderer: GameRenderer;
  public keybinds: Record<string, string> = {};

  constructor(
    private canvas: HTMLCanvasElement,
    private eventBus: EventBus,
    private game: GameView,
  ) {}

  initialize(renderer: GameRenderer) {
    this.renderer = renderer;
    this.keybinds = {
      buildCity: "Digit1",
      buildPort: "Digit2",
      buildLauncher: "Digit3",
      buildAntiLauncher: "Digit4",
      nukeToggle: "KeyQ",
      hydrogenToggle: "KeyW",
    };
  }

  public handleKeyUp(e: KeyboardEvent) {
    const tile = this.game.ref(this.cell.x, this.cell.y);

    this.game
      .myPlayer()
      ?.actions(tile)
      .then((actions) => {
        this.runKeyUpActions(e, tile, actions);
      });
  }

  private runKeyUpActions(e: KeyboardEvent, tile: TileRef, playerActions) {
    if (e.code === this.keybinds.buildCity) {
      this.sendBuildOrUpgrade(
        playerActions.buildableUnits.find((b) => b.type === UnitType.City),
        tile,
      );
    }

    if (e.code === this.keybinds.buildPort) {
      this.sendBuildOrUpgrade(
        playerActions.buildableUnits.find((b) => b.type === UnitType.Port),
        tile,
      );
    }

    if (e.code === this.keybinds.buildLauncher) {
      this.sendBuildOrUpgrade(
        playerActions.buildableUnits.find(
          (b) => b.type === UnitType.MissileSilo,
        ),
        tile,
      );
    }

    if (e.code === this.keybinds.buildAntiLauncher) {
      this.sendBuildOrUpgrade(
        playerActions.buildableUnits.find(
          (b) => b.type === UnitType.SAMLauncher,
        ),
        tile,
      );
    }

    if (e.code === this.keybinds.nukeToggle) {
      this.eventBus.emit(
        new NukePreviewEvent(
          this.cell.x,
          this.cell.y,
          UnitType.AtomBomb,
          false,
        ),
      );
      this.sendBuildOrUpgrade(
        playerActions.buildableUnits.find((b) => b.type === UnitType.AtomBomb),
        tile,
      );
    }

    if (e.code === this.keybinds.hydrogenToggle) {
      this.eventBus.emit(
        new NukePreviewEvent(
          this.cell.x,
          this.cell.y,
          UnitType.HydrogenBomb,
          false,
        ),
      );
      this.sendBuildOrUpgrade(
        playerActions.buildableUnits.find(
          (b) => b.type === UnitType.HydrogenBomb,
        ),
        tile,
      );
    }
  }

  public handleKeyDown(e: KeyboardEvent) {
    if (e.code === this.keybinds.nukeToggle) {
      this.eventBus.emit(
        new NukePreviewEvent(this.cell.x, this.cell.y, UnitType.AtomBomb, true),
      );
    }

    if (e.code === this.keybinds.hydrogenToggle) {
      this.eventBus.emit(
        new NukePreviewEvent(
          this.cell.x,
          this.cell.y,
          UnitType.HydrogenBomb,
          true,
        ),
      );
    }
  }

  public handlePointerMove(e: PointerEvent) {
    this.cell = this.renderer.transformHandler.screenToWorldCoordinates(
      e.clientX,
      e.clientY,
    );
  }

  public sendBuildOrUpgrade(buildableUnit: BuildableUnit, tile: TileRef): void {
    if (buildableUnit.canUpgrade !== false) {
      this.eventBus.emit(
        new SendUpgradeStructureIntentEvent(
          buildableUnit.canUpgrade,
          buildableUnit.type,
        ),
      );
    } else if (buildableUnit.canBuild) {
      this.eventBus.emit(new BuildUnitIntentEvent(buildableUnit.type, tile));
    }
  }

  private getBuildableUnits(): BuildItemDisplay[][] {
    return buildTable.map((row) =>
      row.filter((item) => !this.game?.config()?.isUnitDisabled(item.unitType)),
    );
  }
}
