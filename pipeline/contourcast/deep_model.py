"""Optional PyTorch six-channel self-supervised and two-head model scaffold.

This module intentionally does not download weights or claim a trained model.
It defines architecture, augmentations, losses, and epoch-level training hooks so
that an experiment can be reproduced once an approved dataset is available.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, Mapping, Tuple

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as functional
except ImportError:  # pragma: no cover - exercised by dependency guard test
    torch = None  # type: ignore[assignment]
    nn = None  # type: ignore[assignment]
    functional = None  # type: ignore[assignment]


def require_torch() -> None:
    if torch is None:
        raise RuntimeError(
            "PyTorch is required for the deep-model path. Create an isolated environment "
            "with a platform-appropriate torch build. The baseline/smoke path does not require it."
        )


if nn is not None:

    class ResidualBlock(nn.Module):
        expansion = 1

        def __init__(self, in_channels: int, out_channels: int, stride: int = 1) -> None:
            super().__init__()
            self.conv1 = nn.Conv2d(
                in_channels, out_channels, kernel_size=3, stride=stride, padding=1, bias=False
            )
            self.norm1 = nn.BatchNorm2d(out_channels)
            self.conv2 = nn.Conv2d(
                out_channels, out_channels, kernel_size=3, padding=1, bias=False
            )
            self.norm2 = nn.BatchNorm2d(out_channels)
            self.skip = (
                nn.Identity()
                if stride == 1 and in_channels == out_channels
                else nn.Sequential(
                    nn.Conv2d(in_channels, out_channels, kernel_size=1, stride=stride, bias=False),
                    nn.BatchNorm2d(out_channels),
                )
            )

        def forward(self, inputs: Any) -> Any:
            hidden = functional.relu(self.norm1(self.conv1(inputs)), inplace=True)
            hidden = self.norm2(self.conv2(hidden))
            return functional.relu(hidden + self.skip(inputs), inplace=True)


    class SixChannelResNetEncoder(nn.Module):
        """Compact ResNet-style encoder for 6-channel bathymetry patches."""

        def __init__(self, base_width: int = 32, blocks_per_stage: int = 2) -> None:
            super().__init__()
            if base_width < 8 or blocks_per_stage < 1:
                raise ValueError("base_width >= 8 and blocks_per_stage >= 1 are required")
            self.stem = nn.Sequential(
                nn.Conv2d(6, base_width, kernel_size=5, padding=2, bias=False),
                nn.BatchNorm2d(base_width),
                nn.ReLU(inplace=True),
            )
            stages = []
            in_channels = base_width
            for stage_index, out_channels in enumerate(
                (base_width, base_width * 2, base_width * 4)
            ):
                stage = [
                    ResidualBlock(
                        in_channels,
                        out_channels,
                        stride=1 if stage_index == 0 else 2,
                    )
                ]
                stage.extend(
                    ResidualBlock(out_channels, out_channels)
                    for _ in range(blocks_per_stage - 1)
                )
                stages.append(nn.Sequential(*stage))
                in_channels = out_channels
            self.stages = nn.Sequential(*stages)
            self.pool = nn.AdaptiveAvgPool2d(1)
            self.output_dim = base_width * 4

        def forward(self, inputs: Any) -> Any:
            if inputs.ndim != 4 or inputs.shape[1] != 6:
                raise ValueError("encoder expects batches shaped (N, 6, H, W)")
            hidden = self.stages(self.stem(inputs))
            return self.pool(hidden).flatten(1)


    class TerrainContrastiveModel(nn.Module):
        """SimCLR-style projection head for unlabeled bathymetry patches."""

        def __init__(self, encoder: SixChannelResNetEncoder, projection_dim: int = 128) -> None:
            super().__init__()
            self.encoder = encoder
            self.projector = nn.Sequential(
                nn.Linear(encoder.output_dim, encoder.output_dim),
                nn.ReLU(inplace=True),
                nn.Linear(encoder.output_dim, projection_dim),
            )

        def forward(self, inputs: Any) -> Any:
            return functional.normalize(self.projector(self.encoder(inputs)), dim=1)


    class CatchMultiTaskModel(nn.Module):
        """Fine-tuning model with occurrence and positive-catch CPUE heads."""

        def __init__(self, encoder: SixChannelResNetEncoder, dropout: float = 0.2) -> None:
            super().__init__()
            self.encoder = encoder
            self.dropout = nn.Dropout(dropout)
            self.occurrence_head = nn.Linear(encoder.output_dim, 1)
            self.log_cpue_head = nn.Linear(encoder.output_dim, 1)

        def forward(self, inputs: Any) -> Dict[str, Any]:
            embedding = self.dropout(self.encoder(inputs))
            return {
                "occurrence_logit": self.occurrence_head(embedding).squeeze(1),
                "log_cpue": self.log_cpue_head(embedding).squeeze(1),
                "embedding": embedding,
            }

else:

    class ResidualBlock:  # type: ignore[no-redef]
        def __init__(self, *_: Any, **__: Any) -> None:
            require_torch()

    class SixChannelResNetEncoder:  # type: ignore[no-redef]
        def __init__(self, *_: Any, **__: Any) -> None:
            require_torch()

    class TerrainContrastiveModel:  # type: ignore[no-redef]
        def __init__(self, *_: Any, **__: Any) -> None:
            require_torch()

    class CatchMultiTaskModel:  # type: ignore[no-redef]
        def __init__(self, *_: Any, **__: Any) -> None:
            require_torch()


def augment_terrain_batch(inputs: Any, noise_std: float = 0.02, channel_drop: float = 0.1) -> Any:
    """Semantics-preserving flips, scale jitter, noise, and channel dropout."""

    require_torch()
    augmented = inputs.clone()
    if bool(torch.rand(()) < 0.5):
        augmented = torch.flip(augmented, dims=(-1,))
    if bool(torch.rand(()) < 0.5):
        augmented = torch.flip(augmented, dims=(-2,))
    scale = 1.0 + 0.05 * torch.randn((len(inputs), 1, 1, 1), device=inputs.device)
    augmented = augmented * scale + noise_std * torch.randn_like(augmented)
    if channel_drop > 0:
        keep = torch.rand((len(inputs), inputs.shape[1], 1, 1), device=inputs.device) > channel_drop
        augmented = augmented * keep
    return augmented


def nt_xent_loss(first: Any, second: Any, temperature: float = 0.2) -> Any:
    require_torch()
    if first.shape != second.shape or first.ndim != 2:
        raise ValueError("contrastive embeddings must be two equal (N, D) tensors")
    if len(first) < 2:
        raise ValueError("contrastive loss requires at least two examples")
    representations = functional.normalize(torch.cat([first, second], dim=0), dim=1)
    logits = representations @ representations.T / temperature
    diagonal = torch.eye(len(logits), device=logits.device, dtype=torch.bool)
    logits = logits.masked_fill(diagonal, -1e9)
    batch_size = len(first)
    targets = (torch.arange(2 * batch_size, device=logits.device) + batch_size) % (2 * batch_size)
    return functional.cross_entropy(logits, targets)


def multitask_loss(
    outputs: Dict[str, Any],
    occurrence: Any,
    cpue: Any,
    *,
    cpue_weight: float = 0.5,
    sample_weight: Any | None = None,
) -> Tuple[Any, Dict[str, float]]:
    """Weighted BCE plus positive-only SmoothL1 log-CPUE loss.

    ``sample_weight`` is intended for released CRFS sample-count/reliability
    weights. It is normalized within each batch so absolute survey counts do
    not change the optimizer step scale.
    """

    require_torch()
    occurrence = occurrence.float()
    if sample_weight is None:
        weights = torch.ones_like(occurrence)
    else:
        weights = torch.clamp(sample_weight.float(), min=0.0)
        if weights.shape != occurrence.shape:
            raise ValueError("sample_weight must have the same shape as occurrence")
    weights = weights / torch.clamp(weights.mean(), min=1e-8)
    classification_rows = functional.binary_cross_entropy_with_logits(
        outputs["occurrence_logit"], occurrence, reduction="none"
    )
    classification = torch.sum(classification_rows * weights) / torch.clamp(
        weights.sum(), min=1e-8
    )
    positive = occurrence > 0.5
    if bool(torch.any(positive)):
        regression_rows = functional.smooth_l1_loss(
            outputs["log_cpue"][positive],
            torch.log1p(cpue.float()[positive]),
            reduction="none",
        )
        regression = torch.sum(regression_rows * weights[positive]) / torch.clamp(
            weights[positive].sum(), min=1e-8
        )
    else:
        regression = outputs["log_cpue"].sum() * 0.0
    total = classification + cpue_weight * regression
    return total, {
        "loss": float(total.detach().cpu()),
        "occurrence_loss": float(classification.detach().cpu()),
        "cpue_loss": float(regression.detach().cpu()),
    }


def train_ssl_epoch(
    model: Any,
    loader: Iterable[Any],
    optimizer: Any,
    *,
    device: str = "cpu",
    temperature: float = 0.2,
) -> float:
    """One explicit self-supervised epoch; checkpointing belongs to the caller."""

    require_torch()
    model.train()
    losses = []
    for batch in loader:
        patches = batch[0] if isinstance(batch, (tuple, list)) else batch
        patches = patches.to(device)
        first = model(augment_terrain_batch(patches))
        second = model(augment_terrain_batch(patches))
        loss = nt_xent_loss(first, second, temperature)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()
        losses.append(float(loss.detach().cpu()))
    if not losses:
        raise ValueError("self-supervised loader produced no batches")
    return sum(losses) / len(losses)


def fine_tune_epoch(
    model: Any,
    loader: Iterable[Any],
    optimizer: Any,
    *,
    device: str = "cpu",
    cpue_weight: float = 0.5,
) -> Mapping[str, float]:
    """One two-head epoch with optional sample weight as the fourth batch item."""

    require_torch()
    model.train()
    totals = []
    occurrence_losses = []
    cpue_losses = []
    for batch in loader:
        if len(batch) == 3:
            patches, occurrence, cpue = batch
            sample_weight = None
        elif len(batch) == 4:
            patches, occurrence, cpue, sample_weight = batch
        else:
            raise ValueError(
                "fine-tuning batches must contain patch, occurrence, cpue, and optional sample_weight"
            )
        outputs = model(patches.to(device))
        loss, parts = multitask_loss(
            outputs,
            occurrence.to(device),
            cpue.to(device),
            cpue_weight=cpue_weight,
            sample_weight=sample_weight.to(device) if sample_weight is not None else None,
        )
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()
        totals.append(parts["loss"])
        occurrence_losses.append(parts["occurrence_loss"])
        cpue_losses.append(parts["cpue_loss"])
    if not totals:
        raise ValueError("fine-tuning loader produced no batches")
    return {
        "loss": sum(totals) / len(totals),
        "occurrence_loss": sum(occurrence_losses) / len(occurrence_losses),
        "cpue_loss": sum(cpue_losses) / len(cpue_losses),
    }


def architecture_smoke_test(batch_size: int = 4, patch_size: int = 17) -> Mapping[str, Any]:
    """Run a shape/loss check only. This is not training or model evaluation."""

    require_torch()
    encoder = SixChannelResNetEncoder(base_width=16, blocks_per_stage=1)
    ssl_model = TerrainContrastiveModel(encoder, projection_dim=32)
    inputs = torch.randn(batch_size, 6, patch_size, patch_size)
    first = ssl_model(augment_terrain_batch(inputs))
    second = ssl_model(augment_terrain_batch(inputs))
    ssl_loss = nt_xent_loss(first, second)
    downstream = CatchMultiTaskModel(encoder)
    outputs = downstream(inputs)
    labels = torch.tensor([0, 1] * ((batch_size + 1) // 2))[:batch_size]
    cpue = torch.linspace(0.0, 2.0, batch_size)
    loss, _ = multitask_loss(outputs, labels, cpue)
    return {
        "status": "architecture_smoke_only",
        "input_shape": list(inputs.shape),
        "embedding_shape": list(first.shape),
        "occurrence_shape": list(outputs["occurrence_logit"].shape),
        "cpue_shape": list(outputs["log_cpue"].shape),
        "finite_losses": bool(torch.isfinite(ssl_loss) and torch.isfinite(loss)),
    }
