import bpy
import sys
import os
import math

def setup_scene(res=256):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    
    # Camera
    cam_data = bpy.data.cameras.new('Camera')
    cam = bpy.data.objects.new('Camera', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (0, -4.2, 1.4)
    cam.rotation_euler = (math.radians(74), 0, 0)
    
    # Key light
    l1_data = bpy.data.lights.new('KeyLight', 'SUN')
    l1_data.energy = 4.0
    l1 = bpy.data.objects.new('KeyLight', l1_data)
    scene.collection.objects.link(l1)
    l1.location = (3, -3, 5)
    l1.rotation_euler = (math.radians(45), math.radians(15), math.radians(30))
    
    # Rim light
    l2_data = bpy.data.lights.new('RimLight', 'POINT')
    l2_data.energy = 90.0
    l2 = bpy.data.objects.new('RimLight', l2_data)
    scene.collection.objects.link(l2)
    l2.location = (-2.5, 3, 2.5)
    return scene

def create_mat(name, color=(0.8, 0.8, 0.8, 1.0), metallic=0.0, roughness=0.5, emission=None, emission_strength=1.0):
    mat = bpy.data.materials.new(name=name)
    bsdf = [n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = emission
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat

def render_to(filepath):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.context.scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)
    print(f"[Rendered] -> {filepath}")

# --- Batch 3: Elite & Boss Monsters ---
def generate_ogre(is_king=False):
    setup_scene(256)
    key = "ogreKing" if is_king else "ogre"
    scale = 1.35 if is_king else 1.15
    # Massive body
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.8 * scale))
    body = bpy.context.active_object
    body.scale = (0.7 * scale, 0.5 * scale, 0.7 * scale)
    body_col = (0.6, 0.45, 0.25, 1.0) if is_king else (0.45, 0.4, 0.2, 1.0)
    body.data.materials.append(create_mat(f"{key}_b", body_col, roughness=0.8))
    
    # Head
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.38 * scale, location=(0, -0.1 * scale, 1.55 * scale))
    head = bpy.context.active_object
    head.data.materials.append(create_mat(f"{key}_h", body_col, roughness=0.8))
    
    # Spiked Club
    bpy.ops.mesh.primitive_cylinder_add(radius=0.12 * scale, depth=1.3 * scale, location=(0.85 * scale, -0.2 * scale, 0.9 * scale))
    club = bpy.context.active_object
    club.rotation_euler = (math.radians(20), 0, math.radians(-15))
    club.data.materials.append(create_mat(f"{key}_c", (0.3, 0.2, 0.1, 1.0), roughness=0.9))
    
    # Crown for Ogre King
    if is_king:
        bpy.ops.mesh.primitive_cone_add(radius1=0.4 * scale, depth=0.3 * scale, location=(0, -0.1 * scale, 1.95 * scale))
        crown = bpy.context.active_object
        crown.data.materials.append(create_mat("KingCrown", (0.95, 0.75, 0.1, 1.0), metallic=0.9, roughness=0.2, emission=(0.9, 0.7, 0.1, 1.0), emission_strength=1.5))
        
    render_to(os.path.abspath(f"assets/monsters/{key}.png"))

def generate_golem():
    setup_scene(256)
    # Rocky torso
    bpy.ops.mesh.primitive_cube_add(size=1.2, location=(0, 0, 0.8))
    torso = bpy.context.active_object
    torso.scale = (0.7, 0.5, 0.6)
    torso.data.materials.append(create_mat("GolemStone", (0.35, 0.35, 0.38, 1.0), roughness=0.95))
    # Glowing Runic core
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25, location=(0, -0.32, 0.8))
    core = bpy.context.active_object
    core.data.materials.append(create_mat("GolemRune", (0.1, 0.8, 1.0, 1.0), emission=(0.1, 0.8, 1.0, 1.0), emission_strength=4.0))
    # Head boulder
    bpy.ops.mesh.primitive_cube_add(size=0.6, location=(0, 0, 1.45))
    head = bpy.context.active_object
    head.data.materials.append(create_mat("GolemHead", (0.38, 0.38, 0.42, 1.0), roughness=0.9))
    render_to(os.path.abspath("assets/monsters/stoneGolem.png"))

def generate_floating_eye():
    setup_scene(256)
    # Giant eyeball
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.7, location=(0, 0, 1.0))
    eye = bpy.context.active_object
    eye.data.materials.append(create_mat("EyeWhite", (0.9, 0.88, 0.85, 1.0), roughness=0.2))
    # Glowing iris
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.35, location=(0, -0.45, 1.0))
    iris = bpy.context.active_object
    iris.data.materials.append(create_mat("Iris", (0.8, 0.1, 0.8, 1.0), emission=(0.9, 0.1, 0.9, 1.0), emission_strength=3.5))
    # Stalks/Wings
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cone_add(radius1=0.2, depth=0.8, location=(side * 0.75, 0, 1.35))
        stalk = bpy.context.active_object
        stalk.rotation_euler = (0, math.radians(side * 50), 0)
        stalk.data.materials.append(create_mat("Stalk", (0.6, 0.2, 0.6, 1.0), roughness=0.5))
    render_to(os.path.abspath("assets/monsters/floatingEye.png"))

def generate_cerberus():
    setup_scene(256)
    # Hound body
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.2, 0.65))
    body = bpy.context.active_object
    body.scale = (0.5, 0.9, 0.45)
    body.data.materials.append(create_mat("CerbBody", (0.15, 0.1, 0.1, 1.0), roughness=0.7))
    # 3 heads
    for x, rot in [(-0.35, 20), (0.0, 0), (0.35, -20)]:
        bpy.ops.mesh.primitive_cone_add(radius1=0.25, depth=0.5, location=(x, -0.65, 0.85))
        head = bpy.context.active_object
        head.rotation_euler = (math.radians(-80), 0, math.radians(rot))
        head.data.materials.append(create_mat("CerbHead", (0.2, 0.1, 0.1, 1.0), roughness=0.6))
        # Fiery eyes
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(x, -0.78, 0.95))
        eye = bpy.context.active_object
        eye.data.materials.append(create_mat("CerbEye", (1, 0.3, 0.1, 1), emission=(1, 0.4, 0.1, 1), emission_strength=4.0))
    render_to(os.path.abspath("assets/monsters/cerberus.png"))

def generate_mage(key, robe_color, orb_color):
    setup_scene(256)
    # Robe / Body
    bpy.ops.mesh.primitive_cone_add(radius1=0.55, depth=1.3, location=(0, 0, 0.65))
    robe = bpy.context.active_object
    robe.data.materials.append(create_mat(f"{key}_r", robe_color, roughness=0.5))
    # Hood / Head
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.35, location=(0, 0, 1.35))
    hood = bpy.context.active_object
    hood.data.materials.append(create_mat(f"{key}_h", robe_color, roughness=0.4))
    # Wizard Staff
    bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=1.6, location=(0.6, -0.2, 0.8))
    staff = bpy.context.active_object
    staff.data.materials.append(create_mat("StaffWood", (0.3, 0.18, 0.1, 1.0), roughness=0.8))
    # Magic Orb
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.18, location=(0.6, -0.2, 1.65))
    orb = bpy.context.active_object
    orb.data.materials.append(create_mat(f"{key}_orb", orb_color, emission=orb_color, emission_strength=5.0))
    render_to(os.path.abspath(f"assets/monsters/{key}.png"))

def generate_death_knight():
    setup_scene(256)
    # Obsidian armor
    bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=1.0, location=(0, 0, 0.5))
    body = bpy.context.active_object
    body.data.materials.append(create_mat("DkArmor", (0.05, 0.05, 0.07, 1.0), metallic=0.95, roughness=0.15))
    
    # Horned Skull Helmet
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.38, location=(0, 0, 1.25))
    helm = bpy.context.active_object
    helm.data.materials.append(create_mat("DkHelm", (0.08, 0.08, 0.1, 1.0), metallic=0.9, roughness=0.2))
    
    # Red Fiery Glowing Visor
    bpy.ops.mesh.primitive_cube_add(size=0.15, location=(0, -0.32, 1.25))
    eye = bpy.context.active_object
    eye.scale = (1.5, 0.2, 0.3)
    eye.data.materials.append(create_mat("DkEyes", (1.0, 0.1, 0.05, 1.0), emission=(1.0, 0.2, 0.05, 1.0), emission_strength=5.0))
    
    # Horns
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cone_add(radius1=0.08, depth=0.45, location=(side * 0.35, 0, 1.55))
        horn = bpy.context.active_object
        horn.rotation_euler = (math.radians(-20), math.radians(side * 40), 0)
        horn.data.materials.append(create_mat("DkHorn", (0.15, 0.05, 0.05, 1.0), roughness=0.4))
    
    # Flame Sword of Death Knight
    bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=1.3, location=(0.7, -0.2, 0.75))
    sword = bpy.context.active_object
    sword.rotation_euler = (math.radians(15), math.radians(10), 0)
    sword.data.materials.append(create_mat("FlameSword", (1.0, 0.3, 0.05, 1.0), metallic=0.7, roughness=0.1, emission=(1.0, 0.35, 0.05, 1.0), emission_strength=6.0))
    
    render_to(os.path.abspath("assets/monsters/deathKnight.png"))

def run_batch3():
    print("=== Generating Batch 3: Elite & Boss Monsters ===")
    generate_ogre(is_king=False)
    generate_ogre(is_king=True)
    generate_golem()
    generate_floating_eye()
    generate_cerberus()
    generate_mage("sima", (0.7, 0.1, 0.1, 1.0), (1.0, 0.2, 0.1, 1.0))
    generate_mage("balthazar", (0.1, 0.2, 0.6, 1.0), (0.2, 0.5, 1.0, 1.0))
    generate_mage("casper", (0.1, 0.5, 0.2, 1.0), (0.2, 1.0, 0.4, 1.0))
    generate_mage("markus", (0.35, 0.1, 0.5, 1.0), (0.8, 0.2, 1.0, 1.0))
    generate_death_knight()
    print("Batch 3 completed!")

if __name__ == "__main__":
    args = sys.argv
    batch = "batch3"
    if "--batch" in args:
        idx = args.index("--batch")
        if idx + 1 < len(args):
            batch = args[idx + 1]
    
    if batch == "batch3":
        run_batch3()
