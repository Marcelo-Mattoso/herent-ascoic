import { useState } from "react";
import heroPng from "@/assets/hero.png";

interface MainMenuProps {
	onNewGame: () => void;
}

const STARS = [
	{ left: "7%",  top: "8%",  size: 1.5, opacity: 0.5, twinkle: false },
	{ left: "14%", top: "28%", size: 1,   opacity: 0.4, twinkle: false },
	{ left: "21%", top: "6%",  size: 2,   opacity: 0.7, twinkle: true,  delay: "0s",   dur: "4s"  },
	{ left: "33%", top: "18%", size: 1,   opacity: 0.5, twinkle: false },
	{ left: "41%", top: "11%", size: 1.5, opacity: 0.6, twinkle: false },
	{ left: "57%", top: "4%",  size: 1,   opacity: 0.4, twinkle: false },
	{ left: "66%", top: "22%", size: 2,   opacity: 0.8, twinkle: true,  delay: "1.5s", dur: "3.5s" },
	{ left: "76%", top: "9%",  size: 1,   opacity: 0.5, twinkle: false },
	{ left: "83%", top: "31%", size: 2.5, opacity: 0.6, twinkle: true,  delay: "2.8s", dur: "5s"  },
	{ left: "91%", top: "14%", size: 1,   opacity: 0.4, twinkle: false },
	{ left: "4%",  top: "55%", size: 1.5, opacity: 0.3, twinkle: false },
	{ left: "93%", top: "48%", size: 1,   opacity: 0.4, twinkle: false },
	{ left: "11%", top: "72%", size: 1,   opacity: 0.3, twinkle: false },
	{ left: "87%", top: "68%", size: 2,   opacity: 0.5, twinkle: true,  delay: "0.8s", dur: "4.5s" },
	{ left: "28%", top: "88%", size: 1,   opacity: 0.3, twinkle: false },
	{ left: "73%", top: "83%", size: 1,   opacity: 0.3, twinkle: false },
	{ left: "50%", top: "93%", size: 1.5, opacity: 0.4, twinkle: false },
	{ left: "60%", top: "75%", size: 1,   opacity: 0.3, twinkle: false },
	{ left: "38%", top: "95%", size: 1,   opacity: 0.25, twinkle: false },
	{ left: "96%", top: "78%", size: 1,   opacity: 0.3, twinkle: false },
];

const PARTICLES = [
	{ left: "22%", top: "32%", delay: "0s",   dur: "9s",  size: "9px"  },
	{ left: "74%", top: "26%", delay: "2.4s", dur: "11s", size: "7px"  },
	{ left: "61%", top: "68%", delay: "4.8s", dur: "13s", size: "8px"  },
	{ left: "31%", top: "74%", delay: "1.6s", dur: "10s", size: "6px"  },
];

export function MainMenu({ onNewGame }: MainMenuProps) {
	const [hovered, setHovered] = useState(false);

	return (
		<div
			style={{
				minHeight: "100vh",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				position: "relative",
				overflow: "hidden",
				background: "radial-gradient(ellipse at 50% -5%, #2A1A4A 0%, #150F25 40%, #080610 100%)",
			}}
		>
			{/* Raio de luz divino vindo do alto */}
			<div
				className="menu-divine-beam"
				style={{
					position: "absolute",
					top: 0,
					left: "50%",
					transform: "translateX(-50%)",
					width: "60%",
					height: "70%",
					background: "radial-gradient(ellipse at 50% 0%, rgba(160,100,255,0.18) 0%, rgba(100,60,200,0.08) 40%, transparent 70%)",
					pointerEvents: "none",
					animation: "divine-pulse 6s ease-in-out infinite",
				}}
			/>

			{/* Brilho dourado do horizonte */}
			<div
				style={{
					position: "absolute",
					bottom: 0,
					left: "50%",
					transform: "translateX(-50%)",
					width: "80%",
					height: "40%",
					background: "radial-gradient(ellipse at 50% 100%, rgba(200,151,42,0.08) 0%, transparent 60%)",
					pointerEvents: "none",
				}}
			/>

			{/* Campo de estrelas */}
			{STARS.map((s, i) => (
				<div
					key={i}
					className={s.twinkle ? "menu-star-bright" : undefined}
					style={{
						position: "absolute",
						left: s.left,
						top: s.top,
						width: s.size,
						height: s.size,
						borderRadius: "50%",
						background: "#FFFFFF",
						opacity: s.opacity,
						pointerEvents: "none",
						...(s.twinkle && s.delay && s.dur
							? { animation: `star-twinkle ${s.dur} ease-in-out ${s.delay} infinite` }
							: {}),
					}}
				/>
			))}

			{/* Anel externo — girando lentamente */}
			<div
				className="menu-rune"
				style={{
					position: "absolute",
					top: "50%",
					left: "50%",
					width: 560,
					height: 560,
					borderRadius: "50%",
					border: "1px dashed rgba(160,100,255,0.1)",
					animation: "rune-spin 45s linear infinite",
					pointerEvents: "none",
				}}
			/>
			{/* Anel interno — estático, dourado */}
			<div
				style={{
					position: "absolute",
					top: "50%",
					left: "50%",
					width: 400,
					height: 400,
					borderRadius: "50%",
					border: "1px solid rgba(200,151,42,0.07)",
					transform: "translate(-50%, -50%)",
					pointerEvents: "none",
				}}
			/>

			{/* Vinheta nas bordas */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					background: "radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.75) 100%)",
					pointerEvents: "none",
				}}
			/>

			{/* Partículas flutuantes */}
			{PARTICLES.map((p, i) => (
				<span
					key={i}
					className="menu-ember"
					style={{
						position: "absolute",
						left: p.left,
						top: p.top,
						fontSize: p.size,
						color: "rgba(200,151,42,0.4)",
						animation: `ember-float ${p.dur} ease-in-out ${p.delay} infinite`,
						pointerEvents: "none",
						userSelect: "none",
					}}
				>
					✦
				</span>
			))}

			{/* Painel central */}
			<div
				className="menu-panel"
				style={{
					position: "relative",
					zIndex: 10,
					width: 380,
					maxWidth: "90vw",
					background: "rgba(14,10,28,0.88)",
					backdropFilter: "blur(16px)",
					WebkitBackdropFilter: "blur(16px)",
					border: "1px solid rgba(160,100,255,0.2)",
					borderRadius: 18,
					padding: "44px 44px 40px",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					animation: "panel-fade-in 0.9s ease-out both",
					boxShadow: "0 0 60px rgba(120,60,220,0.12), inset 0 0 40px rgba(160,100,255,0.04)",
				}}
			>
				{/* Logo / emblema */}
				<div style={{ marginBottom: 20, position: "relative" }}>
					<img
						src={heroPng}
						alt=""
						style={{
							width: 110,
							height: "auto",
							filter: "drop-shadow(0 0 18px rgba(160,100,255,0.55)) drop-shadow(0 0 6px rgba(200,151,42,0.3))",
						}}
					/>
				</div>

				{/* Ornamento superior */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						marginBottom: 16,
						width: "100%",
						justifyContent: "center",
					}}
				>
					<div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(200,151,42,0.4))" }} />
					<span style={{ color: "#C8972A", fontSize: "0.75rem", letterSpacing: 4 }}>✦</span>
					<div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(200,151,42,0.4))" }} />
				</div>

				{/* Título */}
				<h1
					className="menu-title"
					style={{
						color: "#D4A832",
						fontSize: "1.8rem",
						fontWeight: 700,
						letterSpacing: "0.18em",
						textTransform: "uppercase",
						textAlign: "center",
						margin: 0,
						lineHeight: 1.1,
						animation: "title-glow 3.5s ease-in-out infinite",
					}}
				>
					Ascensão<br />Heróica
				</h1>

				{/* Subtítulo */}
				<p
					style={{
						color: "rgba(160,130,210,0.7)",
						fontSize: "0.65rem",
						letterSpacing: "0.28em",
						textTransform: "uppercase",
						marginTop: 10,
						marginBottom: 0,
					}}
				>
					Exploração solo de masmorra
				</p>

				{/* Divisor ornamentado */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						width: "100%",
						margin: "28px 0",
					}}
				>
					<div style={{ flex: 1, height: 1, background: "rgba(200,151,42,0.2)" }} />
					<span style={{ color: "rgba(200,151,42,0.5)", fontSize: "0.6rem" }}>◆</span>
					<div style={{ flex: 1, height: 1, background: "rgba(200,151,42,0.2)" }} />
				</div>

				{/* Botões */}
				<div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
					<button
						type="button"
						onClick={onNewGame}
						onMouseEnter={() => setHovered(true)}
						onMouseLeave={() => setHovered(false)}
						style={{
							width: "100%",
							padding: "13px 24px",
							borderRadius: 8,
							border: hovered
								? "1px solid rgba(200,151,42,0.95)"
								: "1px solid rgba(200,151,42,0.6)",
							background: hovered
								? "linear-gradient(135deg, #3D2800 0%, #261800 100%)"
								: "linear-gradient(135deg, #2A1C00 0%, #180F00 100%)",
							color: "#D4A832",
							fontSize: "0.82rem",
							fontWeight: 700,
							letterSpacing: "0.14em",
							textTransform: "uppercase",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
							transition: "all 0.2s ease",
							boxShadow: hovered
								? "0 0 24px rgba(200,151,42,0.25), inset 0 0 16px rgba(200,151,42,0.06)"
								: "inset 0 0 8px rgba(200,151,42,0.04)",
						}}
					>
						<span>⚔️</span> Nova Partida
					</button>

					<button
						type="button"
						disabled
						style={{
							width: "100%",
							padding: "13px 24px",
							borderRadius: 8,
							border: "1px solid rgba(160,100,255,0.1)",
							background: "rgba(255,255,255,0.02)",
							color: "rgba(140,110,190,0.35)",
							fontSize: "0.82rem",
							fontWeight: 500,
							letterSpacing: "0.1em",
							textTransform: "uppercase",
							cursor: "not-allowed",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
						}}
					>
						<span>📚</span> Biblioteca de Cartas
					</button>

					<button
						type="button"
						disabled
						style={{
							width: "100%",
							padding: "13px 24px",
							borderRadius: 8,
							border: "1px solid rgba(160,100,255,0.1)",
							background: "rgba(255,255,255,0.02)",
							color: "rgba(140,110,190,0.35)",
							fontSize: "0.82rem",
							fontWeight: 500,
							letterSpacing: "0.1em",
							textTransform: "uppercase",
							cursor: "not-allowed",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
						}}
					>
						<span>⚙️</span> Configurações
					</button>
				</div>
			</div>

			{/* Rodapé */}
			<p
				style={{
					position: "absolute",
					bottom: 24,
					fontSize: "0.6rem",
					color: "rgba(140,110,190,0.35)",
					letterSpacing: "0.12em",
					textTransform: "uppercase",
				}}
			>
				MVP 1 · v0.9.131
			</p>
		</div>
	);
}
