import re,glob,math,json,os
HERE=os.path.dirname(os.path.abspath(__file__))
SKIPSUF=('_big','_small','_folded','_young','_tiny','_mini','_baby')
SKIP=set('bat_animal tooth_animal mouse_computer egg_chicken egg_quail mouse_toy hand_baby mitten_baby eye_mouse heart_mouse knight_piece queen_piece cap_bottle nut_hardware tablet_pill nail_finger ostrich_egg_nest heart_human grizzly_bear_cub battery_watch sock_baby spoon_baby snail_baby frog_baby tooth_baby egg_ostrich deer_fawn seal_pup cello_bow bow_violin kangaroo_joey beaver_kit fox_kit coyote_pup raccoon_kit lion_cub giraffe_baby emu_chick seal_baby beaver_kit cupcake_mini cookie_mini muffin_mini candy_bar_mini egg_yolk sugar_cube_box bobby_pin_box staple_box paperclip_box japan_island island_city harbor_town dam_small fries_one candy_cane_piece rice_ball_small speck_dust dust_speck bat_animal_wings sleeping_bag_rolled tent_bag cookie_dough_ball crumb_small krill_small glitter_big grain_of_corn bean_coffee cartridge_bullet chain_necklace sewing_kit_box compass_box medal_case bandage_box finger_tip ink_cartridge brick_stack dice_cup cup_holder watch_box keyboard_instrument organ_pipe drum_barrel tent_pole fence_panel barn_door scooter_board 2x4 heart_big brain_big sheepdog_puppy grizzly_grizzly sailboat_small greenhouse_small dumpster_small lunch_cooler toy_car_big monitor_big tv_small pickup_pickup'.split())
SKIP|=set(open(os.path.join(HERE,'sizes','skip.txt')).read().split())
SKIP|=set(open(os.path.join(HERE,'sizes','proper.txt')).read().split())   # no proper nouns
S={}
order=[]
for f in sorted(glob.glob(os.path.join(HERE,'sizes','sizes_*.txt'))):
    for line in open(f):
        line=line.split('#')[0].strip()
        if not line: continue
        sz,ws=line.split(':',1); sz=float(sz)
        for w in ws.split():
            if w in SKIP or w.endswith(SKIPSUF) or '_big_' in w: continue
            S[w]=sz
BASE=0.001
tier=lambda s:max(1,round(math.log(s/BASE)/math.log(1.5))+1)
T={w:tier(s) for w,s in S.items()}
# extra meanings (wing of a bird / wing of a hospital): word -> list of extra tiers
ALT={}
for line in open(os.path.join(HERE,'sizes','senses.txt')):
    line=line.split('#')[0].strip()
    if not line: continue
    w,sz=line.split(':',1)
    if w.strip() in T: ALT[w.strip()]=sorted({tier(float(x)) for x in sz.split()}-{T[w.strip()]})
if __name__=='__main__':
    print(len(S), 'tiers', min(T.values()), max(T.values()))
    import collections; c=collections.Counter(T.values()); print(sorted(c.items()))
