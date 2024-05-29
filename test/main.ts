import { SchematicRenderer } from "../src/SchematicRenderer";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const schematicBase64 =
	"H4sIAAAAAAAAA11P20rEQAw9ncHtdrx8hJ8h6IO44IOLguJ6QSS2aRvsTqETUF/9UT9FM6ywYiAk53BykgRU13XPa1KpS1Snw1i/npESgLkliqJwDrNzlq5X5PaCY6c9XMB8yUqNiT2q1eKybRPr3bfFH3z/Dz9kU+xitoHWexN8WT2x+hlQXtHAquyxv5bI9UStHpFM+RaPwy3XTZTS80s++DHF8e3juKUh8VP29zjYChPFxjhnbPg1X9J7VlXYu5GBF1FFhVPYjJa3PCUZY97osLOSJr+LH/Ay+vAqAQAA";
const adderSchematicBase64String =
	"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";
const redstoneTestBase64String =
	"H4sIAAAAAAAA/4WRT2/bMAzFWauJY6fdaYd9CB+62zBMl2IFtmFFCxRYtwVDoFl0LNSRDIlGmm9f0Xbi7h928MGk+OPjezlkd2WNW0WmFJDfqgaJ8Fo9AkCWQzoWBHzaGoulVxW99agDOYvrnfG4QhVIBqOxsM5TLW3sFK3boZcXRXDdobTD8d2PiBYC3kzA1jBvXaPSq0qVxm5k1xahjjxZqSZgQfsWZYgaH/Y8vhDw6i96fjaufIjtEwEXU3sYWw9LVvhIaDVqSb7D4riNqYmAd9NY6bat8oqcP2jiS4ut0yiH3nhmZPUiGTEXcPlcWIuK0K80NmovXx/WsRUFaz2M/gmaCTifQMr4WEsFvJxqu9pQjMC5BtjQ/wTUR/DPgPr4fgnoNBLTL+iDcZatSWD+Ge2GahA5LK6RlFakBGT3VzdVFZC+DiqO/99++//OuUDEfECzqYnNXr6PiOOOF5RCdsmucDm+PmPCSSJOZ/N0kcF537uyZMhgyLm3BHHrQr+H4eMn4Oymo7ajO7OxqndnAclH/dy8KdwoaXZvdDwsWcJ80DoS+aSKj4cnw4eeISYDAAA=";
const pistonTestBase64String =
	"H4sIAAAAAAAA/12OQUvDQBCFX7rYmC36S3LrTclFLHiwKAjWWqUsm9ns0nRTsiO0/97dRKp4GIZ5zHvvkyhetKW9YqcF5LNqiZmW6ghgIpH/CALzvfOke2X4JsTf3Wl7cIE7v6Ejk6+prrj/otIo7XxT+a5n+xkzMoHbX+do2VpS9ebvZxlsXJVRbaCSTweqxo6UAAjkr9QH1/kENcH0kXzDNvFdLolVrVgJFKvFkzGB+G30nO/1v/s9YSHGPJBrLCfE2X2MOHdcc47iru30LsmpE1mBq0FZeHbsKEgM+sXK1ZEkm2E6hg9VwEccE0fiG0ZzKYphAQAA";
const redstoneDot =
	"H4sIAAAAAAAA/02OUWvCQBCEpwlNTMT+Eh98FnwRBZGKhYJaReVINuZQ78rdlvTn9y6XigsLO8PyzeTIPoua7oJlESP/EDdippX4BfCSI+2MGMu7VFQYUfHYUGlZKzo30tCBhOWJcnKotOE6nN+6ITMZDa3++bca6v6O8BMj3ZCxUisnogjJO6kL1z60tyIWpWARI9vO11VliXe+z5P+CoyH3rdQh1mQvNTsf/szh3hkvHGKbHrTxdXbnoYMg9aYK5YsyeYB8bqVpS/SRxLYbRJwclu5TfAHVSWHlDUBAAA=";
const angle =
	"H4sIAAAAAAAA/02OX0vDQBDExwYTk6KfJA8+C3kRCyIWBcH6B5UjmTSL7Z3crcSP710ixYV9mJnlN1uhfGgH7o1Km6G6Nzuqcm1+ABxVKP6MDDd7sWy96fXCswvqLD9G8XylCdoE6Vhb53VobEzqLzfSN+d1cN/RmtKR8S6Fb0iToXikD+JsFIsF8lvarQ6p9GRNNZ1Rk6HcrO76PlCf0j//9PPMOOiXCRox15TtoOl2eRURh44zLVBe7lz7mexEQ4nTyVhZFRWGakYcb6RLjyyRz+ypCXiP28fN8QtUakeBNQEAAA==";
const fenceTestBase64String =
	"H4sIAAAAAAAA/11O0UoDMRCcXrDnpeiX9AsEX8SCDxZFwapFdMlt7kKvCSRb6uebXI8+uLCwM7szsxrNq+l5T+KMgn6mgUV4Tb8AZhr1RCi87J1nE8nKTaDdt2VveMuU5NbSkHjpQ5R+mlM45FnigZdHEo5D6Dpup+WRs6bsvlBKoX7jmFzwGVQV5o/sO+lL+OWahVoSUmg2qydrE8v7SXPGH//wZ/kb2eaBXdcLZgqL+2xxzriWGs3dEMyu0ON1g6uRWHlx4jjp4lnhYuPa8sgC85P3mAT85La5Nf4Abf+wrT0BAAA=";
const diagonalCCA =
	"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";
const complexTest =
	"H4sIAAAAAAAA/41Tf2/TMBC9xOuPpCvbH8CHQP0DCYFgUiU0mMQkJiaBGFChymsujTU3zuwr2fgIfGk4J02zllVgKXJ8znv37t4lhujjLMOFJDUTEJ9LjUR4Jm8AYBhDbxUQ8HKhcpxZmdJRoRyZfJqhTCapnKl8Pl4WI5cZS+NUaocjui1w7Jjy6vY7E/UEPGnhmSkKtBPM5aXGZEx2iaMVTWLK3AMGAp62gJpoWqed4A1hnmwBl4WHdQU8bmHXS2np5/RSm9kVX4KAV+0l1+yoUY/SUa3ZqnlGo1ISWm3mc85SFeTJ9wU8bPFlpginpTGar/YEPGuvNP7g8pgax6XUupFYcsJRYUq0K+2eVAg4bpFkVVEqi9PMmKuJJJIscyWhoXFmSdmaZ62us+HQjuo0pjuKiwU8b+HM7FvN9bH+KRk7yxqynE3ORlpRiw0FDFusVJZjgYBHdwzUaoFrI/oCjnZIrXpUDw8fNd4vNmIre5/ROmVynz+E7nvM55SBiKF/hiQTSVJAdHHyIU0d0pfa/vX5629ed87f/BmY5h16//0cDd4yxTrHA+pBdOz1+zCTvYBmBWEg9oKgE/jVDVar17z0gyDiLQ4G+7xFMKxYTnJSpNDFfngGIM6NqxQynY/4oiLonBIuXJWkD+FpAgdbXYMNZOinAKr2/Bu58Y2Aw09W5i5F+4YH2v+ELfRw+8f9S26n2u/VEvyPlhA6Fyrx7g2gWxviadiSX7wf8PMa/gAtf+TdpwQAAA==";
const corsBypass = "http://localhost:8079/";

async function getVanillaTweaksResourcePackLinks() {
	return fetch(
		"http://localhost:8079/https://vanillatweaks.net/assets/server/zipresourcepacks.php",
		{
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded; charset=UTF-8",
			},
			body: "packs=%7B%22aesthetic.more-zombies%22%3A%5B%22MZSteve%22%2C%22MZAlex%22%2C%22MZAri%22%2C%22MZEfe%22%2C%22MZKai%22%2C%22MZMakena%22%2C%22MZNoor%22%2C%22MZSunny%22%2C%22MZZuri%22%5D%2C%22aesthetic%22%3A%5B%22AlternateBlockDestruction%22%2C%22BlackNetherBricks%22%2C%22CherryPicking%22%2C%22UnbundledHayBales%22%2C%22UnbundledDriedKelp%22%2C%22SolidHoney%22%2C%22SolidSlime%22%2C%22WarmGlow%22%2C%22LessPurplePurpur%22%2C%22DarkOakSaturation%22%2C%22HorizontalNuggets%22%2C%22SidewaysNuggets%22%2C%22SofterWool%22%2C%22BrownLeather%22%2C%22RedIronGolemFlowers%22%2C%22StemToLog%22%2C%22BetterParticles%22%2C%22HDShieldBanners%22%2C%22EndlessEndRods%22%2C%22PinkEndRods%22%2C%22UniqueDyes%22%2C%22AnimatedCampfireItem%22%2C%22AshlessCampfires%22%2C%22GlassDoors%22%2C%22GlassTrapdoors%22%2C%22FlintTippedArrows%22%2C%22SplashXpBottle%22%2C%222DSpyglass%22%2C%22AccurateSpyglass%22%2C%22AccurateScaffolding%22%2C%22FencierFences%22%2C%22MossCarpetOverhang%22%2C%22SmootherWarpedPlanks%22%2C%22ConsistentBambooPlanks%22%2C%22AlternateCutCopper%22%2C%22PolishedStonesToBricks%22%2C%22SingularGlazedTerracotta%22%2C%22HorizontalWorldBorder%22%2C%22PlainLeatherArmor%22%2C%22GoldenCrown%22%2C%22ClassicNetheriteArmor%22%2C%22AllayElytra%22%2C%22PhantomElytra%22%2C%22ConcorpWings%22%2C%22EnderDragonElytra%22%5D%2C%22terrain.lower-and-sides%22%3A%5B%22LowerGrass%22%2C%22GrassSides%22%2C%22LowerMycelium%22%2C%22MyceliumSides%22%2C%22LowerPaths%22%2C%22PathSides%22%2C%22LowerPodzol%22%2C%22PodzolSides%22%2C%22LowerSnow%22%2C%22SnowSides%22%2C%22LowerCrimsonNylium%22%2C%22CrimsonNyliumSides%22%2C%22LowerWarpedNylium%22%2C%22WarpedNyliumSides%22%5D%2C%22terrain%22%3A%5B%22BushyLeaves%22%2C%22WavyLeaves%22%2C%22WavyPlants%22%2C%22WavyWater%22%2C%22DarkerDarkOakLeaves%22%2C%22GoldenSavanna%22%2C%22UniversalLushGrass%22%2C%22BetterBedrock%22%2C%22CircularSunandMoon%22%2C%22TwinklingStars%22%2C%22CircleLogTops%22%2C%22SmootherOakLog%22%2C%22SmootherStones%22%2C%22SmoothDirt%22%2C%22SmoothCoarseDirt%22%2C%22BrighterNether%22%2C%22ClearerWater%22%2C%22UniformOres%22%2C%22FancySunflowers%22%2C%22TallerSunflowers%22%2C%22ShorterGrass%22%2C%22ShorterTallGrass%22%2C%22WhiterSnow%22%5D%2C%22variation%22%3A%5B%22VariatedDirt%22%2C%22RandomCoarseDirtRotation%22%2C%22VariatedGrass%22%2C%22VariatedCobblestone%22%2C%22RandomMossRotation%22%2C%22VariatedBricks%22%2C%22VariatedLogs%22%2C%22VariatedMushroomBlocks%22%2C%22VariatedEndStone%22%2C%22VariatedGravel%22%2C%22VariatedMycelium%22%2C%22VariatedPlanks%22%2C%22VariatedStone%22%2C%22VariatedTerracotta%22%2C%22VariatedUnpolishedStones%22%2C%22VariatedBookshelves%22%2C%22RandomSunflowerRotation%22%2C%22VariatedVillagers%22%5D%2C%22connected-textures%22%3A%5B%22ConnectedBookshelves%22%2C%22ConnectedPolishedStones%22%2C%22ConnectedIronBlocks%22%2C%22ConnectedLapisBlocks%22%5D%2C%22utility%22%3A%5B%22DiminishingTools%22%2C%22MobSpawnIndicator%22%2C%22OreBorders%22%2C%22SuspiciousSandGravelBorders%22%2C%22BuddingAmethystBorders%22%2C%22VisualInfestedStoneItems%22%2C%22VisualWaxedCopperItems%22%2C%22Fullbright%22%2C%22FullAgeCropMarker%22%2C%22FullAgeAmethystMarker%22%2C%22DifferentStems%22%2C%22Age25Kelp%22%2C%22MineProgressBar%22%2C%22ClearBannerPatterns%22%2C%22HungerPreview%22%2C%22MusicDiscRedstonePreview%22%2C%22StickyPistonSides%22%2C%22DirectionalHoppers%22%2C%22DirectionalDispensersDroppers%22%2C%22BetterObservers%22%2C%22CleanRedstoneDust%22%2C%22RedstonePowerLevels%22%2C%22UnlitRedstoneOre%22%2C%22GroovyLevers%22%2C%22VisibleTripwires%22%2C%22CompassLodestone%22%2C%22BrewingGuide%22%2C%22VisualHoney%22%2C%22VisualCauldronStages%22%2C%22VisualComposterStages%22%2C%22VisualSaplingGrowth%22%2C%22NoteblockBanners%22%2C%22ArabicNumerals%22%5D%2C%22unobtrusive%22%3A%5B%22UnobtrusiveRain%22%2C%22UnobtrusiveSnow%22%2C%22UnobtrusiveParticles%22%2C%22NoCherryLeavesParticles%22%2C%22BorderlessGlass%22%2C%22BorderlessStainedGlass%22%2C%22BorderlessTintedGlass%22%2C%22CleanGlass%22%2C%22CleanStainedGlass%22%2C%22CleanTintedGlass%22%2C%22UnobtrusiveScaffolding%22%2C%22AlternateEnchantGlint%22%2C%22LowerFire%22%2C%22LowerShield%22%2C%22NoFog%22%2C%22TransparentPumpkin%22%2C%22NoPumpkinOverlay%22%2C%22TransparentSpyglassOverlay%22%2C%22NoSpyglassOverlay%22%2C%22NoVignette%22%2C%22NoBeaconBeam%22%2C%22CleanerWorldBorder%22%2C%22InvisibleTotem%22%2C%22SmallerUtilities%22%2C%22ShortSwords%22%5D%2C%223d%22%3A%5B%223DBookshelves%22%2C%223DChiseledBookshelves%22%2C%223DChains%22%2C%223DPointedDripstone%22%2C%223DAmethyst%22%2C%223DRedstoneWire%22%2C%223DTiles%22%2C%223DLadders%22%2C%223DRails%22%2C%223DSugarcane%22%2C%223DIronBars%22%2C%223DLilyPads%22%2C%223DDoors%22%2C%223DTrapdoors%22%2C%223DMushrooms%22%2C%223DVines%22%2C%223DGlowLichen%22%2C%223DSculkVein%22%2C%223DStonecutters%22%2C%223DSunMoon%22%5D%2C%22fixes-and-consistency%22%3A%5B%22ItemStitchingFix%22%2C%22JappaObserver%22%2C%22JappaToasts%22%2C%22JappaStatsIcons%22%2C%22JappaSpecIcons%22%2C%22RedstoneWireFix%22%2C%22DripleafFixBig%22%2C%22DripleafFixSmall%22%2C%22ConsistentUIFix%22%2C%22ConsistentDecorPot%22%2C%22ConsistentBucketFix%22%2C%22ConsistentTadpoleBucket%22%2C%22CactusBottomFix%22%2C%22ConsistentHelmets%22%2C%22BrighterRibTrim%22%2C%22HangingSignLogs%22%2C%22PixelConsistentBat%22%2C%22PixelConsistentGhast%22%2C%22PixelConsistentElderGuardian%22%2C%22PixelConsistentWither%22%2C%22TripwireHookFix%22%2C%22PixelConsistentSigns%22%2C%22PixelConsistentXPOrbs%22%2C%22PixelConsistentBeaconBeam%22%2C%22PixelConsistentSonicBoom%22%2C%22PixelConsistentGuardianBeam%22%2C%22SoulSoilSoulCampfire%22%2C%22BlazeFix%22%2C%22SlimeParticleFix%22%2C%22NicerFastLeaves%22%2C%22ProperBreakParticles%22%2C%22NoBowlParticles%22%2C%22IronBarsFix%22%2C%22ConsistentSmoothStone%22%2C%22DoubleSlabFix%22%2C%22ItemHoldFix%22%2C%22HoeFix%22%2C%22CloudFogFix%22%5D%7D&version=1.20",
		}
	)
		.then((response) => response.json())
		.then(
			(data) => "http://localhost:8079/https://vanillatweaks.net" + data.link
		);
}

//cached 30 minute vanilla tweaks resource pack link
async function getCachedVanillaTweaksResourcePackLink() {
	const cachedLink = localStorage.getItem("vanillaTweaksResourcePackLink");
	const cachedTime = localStorage.getItem("vanillaTweaksResourcePackLinkTime");
	const isCacheTimeValid = (cachedTime) => {
		const currentTime = new Date().getTime();
		const timeDifference = currentTime - cachedTime;
		const timeDifferenceInMinutes = timeDifference / 1000 / 60;
		return timeDifferenceInMinutes < 30;
	};
	if (cachedLink && isCacheTimeValid(cachedTime)) {
		return cachedLink;
	} else {
		const vanillaTweaksResourcePackLink =
			await getVanillaTweaksResourcePackLinks();
		localStorage.setItem(
			"vanillaTweaksResourcePackLink",
			vanillaTweaksResourcePackLink
		);
		localStorage.setItem(
			"vanillaTweaksResourcePackLinkTime",
			String(new Date().getTime())
		);
		return vanillaTweaksResourcePackLink;
	}
}

async function getRessourcePackLinks() {
	const vanillaTweaksResourcePackLink =
		await getCachedVanillaTweaksResourcePackLink();
	const vanillaPack =
		"http://localhost:8079/https://www.curseforge.com/api/v1/mods/457153/files/5008188/download";
	const packs = [];
	packs.push(vanillaTweaksResourcePackLink);
	packs.push(vanillaPack);
	return packs;
}

async function getAllResourcePackBlobs() {
	const resourcePackBlobs = [];
	const ressourcePackLinks = await getRessourcePackLinks();
	for (const resourcePackLink of ressourcePackLinks) {
		const response = await fetch(resourcePackLink);
		const resourcePackBlob = await response.blob();
		resourcePackBlobs.push(resourcePackBlob);
	}
	return resourcePackBlobs;
}

getAllResourcePackBlobs().then((resourcePackBlobs) => {
	const renderer = new SchematicRenderer(canvas, complexTest, {
		resourcePackBlobs,
	});
});
